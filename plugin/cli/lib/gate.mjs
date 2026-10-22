// Merge gate, push, fix and the CI history check (docs/design/verification.md, docs/design/gate.md).
// Settings, codes and messages come from cli.json; project commands come from the owner's profile.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { CLI_DIR, config, UsageError } from './config.mjs';
import { msg, render } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { checkBundle, parseDoc, writeIndexes } from './okf.mjs';
import { computeLane, inside, readPlan } from './grid.mjs';
import { approval, baseOf, branchOf, bundleOf, diffHash, git, readState, reviewFocuses, roundsOf, runtimeFile, tryGit } from './state.mjs';

const G = config.gate;
const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]).map(String);
const matches = (path, glob) => inside('/' + path, glob);
const finding = (code, path, line, key, data) => ({ code, level: 'error', path, line, message: msg(key, data), fix: G.codes[code].fix });
const done = (output, code = config.exit.ok, findings = []) => ({ code, findings, output });
const shell = (cwd, command) => spawnSync(command, { cwd, shell: true, encoding: 'utf8' }).status === 0;
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

// Paths only `merge` writes: bundle indexes and logs, and the profile's shared files.
export function mergeWritten(path, bundleRel, profile) {
  const name = basename(path);
  return ((name === config.okf.index || name === config.okf.log) && matches(path, `/${bundleRel}/**`))
    || list(profile.shared).some((g) => matches(path, g));
}

// Paths a direct (non-unit) commit may touch: the bundle, .aidlc and the files init writes.
export function directAllowed(path, bundleRel) {
  const init = config.init.files.map((f) => render(f.to, { bundle: bundleRel }));
  return matches(path, `/${bundleRel}/**`) || G.direct.some((g) => matches(path, '/' + g))
    || init.includes(path) || [config.init.gitignore, config.init.settings].includes(path);
}

// A glob as a regex whose single `*` segments are captured, for `same: false` boundaries.
function globRegex(glob) {
  let g = glob.replace(/^\.?\//, '');
  if (!glob.startsWith('/') && !g.includes('/')) g = '**/' + g;
  const body = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (t) => (t.startsWith('**') ? (t.endsWith('/') ? '(?:.*/)?' : '.*') : t === '*' ? '([^/]*)' : '[^/]'));
  return new RegExp(`^${body}$`);
}

// Denied edges of the dependency graph the project's `architecture.graph` command prints.
export function boundaryFindings(edges, architecture, approvedDecisions = new Set()) {
  const out = [];
  for (const [from, to] of edges) {
    for (const b of architecture.boundaries ?? []) {
      if (list(b.except).some((d) => approvedDecisions.has(d))) continue;
      const fm = from.match(globRegex(b.from));
      if (!fm) continue;
      for (const deny of list(b.deny)) {
        const tm = to.match(globRegex(deny));
        if (!tm) continue;
        if (b.same === false && fm.slice(1).join('/') === tm.slice(1).join('/')) continue;
        out.push(finding('ARCH-BOUNDARY', from, 1, 'archEdge', { from, to, reason: b.reason ?? deny }));
      }
    }
  }
  return out;
}

function architecture(cwd, profile, bundle) {
  const arch = profile.architecture;
  if (!arch) return [];
  const out = [];
  if (arch.graph) {
    const r = spawnSync(arch.graph, { cwd, shell: true, encoding: 'utf8' });
    if (r.status !== 0) out.push(finding('ARCH-CHECK', '.', 1, 'gateCheck', { command: arch.graph }));
    const edges = (r.stdout ?? '').split('\n').map((l) => l.split(G.edge).map((s) => s.trim())).filter((e) => e.length === 2 && e[0] && e[1]);
    const approved = new Set(list(arch.boundaries?.flatMap((b) => list(b.except))).filter((d) => {
      const file = join(cwd, d);
      return existsSync(file) && approval(parseDoc(readFileSync(file, 'utf8'))) === 'approved';
    }));
    out.push(...boundaryFindings(edges, arch, approved));
  }
  for (const command of list(arch.checks)) if (!shell(cwd, command)) out.push(finding('ARCH-CHECK', '.', 1, 'gateCheck', { command }));
  return out;
}

function addLogEntry(bundleDir, entry) {
  const file = join(bundleDir, config.okf.log);
  if (!existsSync(file)) return;
  const today = `## ${new Date().toISOString().slice(0, 10)}`;
  const lines = readFileSync(file, 'utf8').split('\n');
  const first = lines.findIndex((l) => l.startsWith('## '));
  if (first >= 0 && lines[first] === today) lines.splice(first + 2, 0, entry);
  else if (first >= 0) lines.splice(first, 0, today, '', entry, '');
  else lines.push('', today, '', entry);
  writeFileSync(file, lines.join('\n'));
}

function trialWorktree(cwd, base) {
  const dir = join(mkdtempSync(join(tmpdir(), 'gate-')), 'w');
  git(cwd, 'worktree', 'add', '-q', '--detach', dir, base);
  return dir;
}
const dropWorktree = (cwd, dir) => { tryGit(cwd, 'worktree', 'remove', '--force', dir); rmSync(dir, { recursive: true, force: true }); };

// All gate conditions on a trial merge; returns { findings, tree } with the merged tree left for commit.
function runGate(cwd, st, unit) {
  const { profile, base } = st;
  const p = withDefaults(profile);
  const bundleRel = relative(git(cwd, 'rev-parse', '--show-toplevel'), st.bundle).split('\\').join('/');
  const out = [];
  const add = (code, key, data, path = relative(cwd, unit.file)) => out.push(finding(code, path, 1, key, { unit: unit.id, ...data }));

  if (['draft', 'stale'].includes(unit.state)) add('GATE-APPROVAL', 'gateApproval', { state: unit.state });
  for (const dep of unit.depends) if (st.units.find((u) => u.id === dep)?.state !== 'merged') add('GATE-DEPS', 'gateDeps', { dep });
  const card = readJson(runtimeFile(cwd, 'cards', unit.id));
  if (!card) add('GATE-CARD', 'gateNoCard', {});

  const paths = git(cwd, 'diff', '--name-only', `${base}...${branchOf(unit.id)}`).split('\n').filter(Boolean);
  for (const path of paths) {
    if (mergeWritten(path, bundleRel, profile)) add('GATE-SHARED', 'gateShared', { path }, path);
    else if (!unit.scope.some((g) => matches(path, g))) add('SCOPE-OUT', 'gateScope', { path }, path);
  }
  const diffLane = computeLane(paths, profile, { paths: true });
  if (card && G.lanes.indexOf(diffLane.lane) > G.lanes.indexOf(card.lane)) add('GATE-LANE', 'gateLane', { lane: diffLane.lane, reason: diffLane.reason, card: card.lane });

  const hash = diffHash(cwd, base, unit.id);
  const general = roundsOf(unit.review).at(-1);
  if (!general || general.verdict !== G.pass || general.diffHash !== hash) add('GATE-REVIEW', 'gateReview', {});
  else if (card && general.card !== card.hash) add('GATE-CARD', 'gateCardStale', { reviewed: general.card, card: card.hash });
  const needed = reviewFocuses(cwd, p, base, unit.id);
  needed.delete(config.state.focus);
  for (const [focus, why] of needed) {
    const last = roundsOf(unit.review, focus).at(-1);
    if (!last || last.verdict !== G.pass || last.diffHash !== hash) add('GATE-SPECIALIST', 'gateSpecialist', { focus, why });
  }

  const tree = trialWorktree(cwd, base);
  if (tryGit(tree, 'merge', '-q', '--no-ff', '--no-commit', branchOf(unit.id)) === null) {
    tryGit(tree, 'merge', '--abort');
    add('GATE-CONFLICT', 'gateConflict', { base });
    return { findings: out, tree };
  }

  const levelPaths = (level) => list(p.levels?.[level]?.paths);
  for (const ac of unit.acs) {
    const tag = `${unit.id}/${ac.id}`;
    const files = (tryGit(tree, 'grep', '-l', '-F', tag) ?? '').split('\n').filter(Boolean);
    if (!files.length) add('GATE-AC', 'gateAc', { tag });
    else if (levelPaths(ac.level).length && !files.some((f) => levelPaths(ac.level).some((g) => matches(f, g)))) {
      add('GATE-LEVEL', 'gateLevel', { tag, files: files.join(', '), level: ac.level });
    }
  }

  const touched = (p.modules ?? []).filter((m) => paths.some((x) => list(m.paths).some((g) => matches(x, g))));
  for (const m of touched.filter((x) => x.check)) if (!shell(tree, m.check)) add('GATE-CHECK', 'gateCheck', { command: m.check });
  for (const command of list(p.security?.check)) if (!shell(tree, command)) add('GATE-SECURITY', 'gateCheck', { command });
  out.push(...architecture(tree, p, st.bundle));

  if (card?.lane === 'full') {
    const tests = Object.keys(p.levels ?? {}).flatMap(levelPaths);
    const production = paths.filter((x) => !tests.some((g) => matches(x, g)));
    if (production.length) {
      const proof = trialWorktree(cwd, base);
      tryGit(proof, 'merge', '-q', '--no-ff', '--no-commit', branchOf(unit.id));
      for (const file of production) {
        if (tryGit(proof, 'cat-file', '-e', `${base}:${file}`) !== null) git(proof, 'checkout', base, '--', file);
        else tryGit(proof, 'rm', '-q', '-f', file);
      }
      for (const level of new Set(unit.acs.map((a) => a.level))) {
        const run = p.levels?.[level]?.run;
        if (!run) add('GATE-PROOF', 'gateNoRun', { level });
        else if (shell(proof, run)) add('GATE-PROOF', 'gateProof', { level });
      }
      tryGit(proof, 'merge', '--abort');
      dropWorktree(cwd, proof);
    }
  }

  const treeBundle = join(tree, bundleRel);
  writeIndexes(treeBundle);
  addLogEntry(treeBundle, msg('gateLogEntry', { unit: unit.id, title: String(unit.fm.title ?? '') }));
  for (const command of list(p.regen)) shell(tree, command);
  for (const f of checkBundle(treeBundle, { rules: p.docs?.rules ?? {}, base: tree }).filter((x) => x.level === 'error')) {
    out.push(finding('GATE-OKF', f.path, f.line, 'gateOkf', f));
  }
  return { findings: out, tree };
}

// Base commits in `range` that are neither gate merges in scope nor direct commits on allowed paths.
function historyFindings(cwd, range, st, codes) {
  const bundleRel = relative(git(cwd, 'rev-parse', '--show-toplevel'), st.bundle).split('\\').join('/');
  const out = [];
  const shas = (tryGit(cwd, 'rev-list', '--first-parent', '--reverse', range) ?? '').split('\n').filter(Boolean);
  for (const sha of shas) {
    const parents = git(cwd, 'rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
    const changed = (tryGit(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', '--root', ...(parents.length ? [parents[0]] : []), sha) ?? '').split('\n').filter(Boolean);
    const short = sha.slice(0, 12);
    if (parents.length > 1) {
      const trailers = git(cwd, 'log', '-1', '--format=%(trailers:only,unfold)', sha);
      const value = (key) => trailers.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1]?.trim();
      for (const t of Object.values(G.trailers)) if (!value(t)) out.push(finding(codes.merge, '.', 1, 'ciTrailer', { sha: short, trailer: t }));
      const unitId = value(G.trailers.unit);
      const unit = unitId && st.units.find((u) => u.id === unitId);
      const doc = unit && tryGit(cwd, 'show', `${sha}:${relative(git(cwd, 'rev-parse', '--show-toplevel'), unit.file).split('\\').join('/')}`);
      const scope = doc ? list(parseDoc(doc + '\n').fm?.scope) : [];
      for (const path of changed) {
        if (unit && !mergeWritten(path, bundleRel, st.profile) && !scope.some((g) => matches(path, g))) out.push(finding(codes.merge, path, 1, 'ciScope', { sha: short, unit: unitId, path }));
      }
    } else {
      for (const path of changed.filter((x) => !directAllowed(x, bundleRel))) out.push(finding(codes.commit, path, 1, 'ciCommit', { sha: short, path }));
    }
  }
  return out;
}

function nextUnitId(bundle) {
  const ids = readPlan(bundle).units.map((u) => Number(u.id.split('-')[1]));
  return `U-${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

export const commands = {
  merge(args, { cwd }) {
    const st = readState(cwd);
    const unit = st.units.find((u) => u.id === args[0]);
    if (!unit) throw new UsageError(msg('unknownUnit', { name: args[0] ?? '', dir: relative(cwd, join(st.bundle, config.grid.units)) }));
    if (git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') !== st.base) throw new UsageError(msg('gateNotBase', { base: st.base }));
    if (!tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unit.id))) throw new UsageError(msg('noBranch', { branch: branchOf(unit.id) }));
    const { findings, tree } = runGate(cwd, st, unit);
    if (findings.length) {
      tryGit(tree, 'merge', '--abort');
      dropWorktree(cwd, tree);
      return done('', config.exit.findings, findings);
    }
    const card = readJson(runtimeFile(cwd, 'cards', unit.id));
    git(tree, 'add', '-A');
    git(tree, 'commit', '-q', '-m', `Merge ${unit.id}: ${unit.fm.title ?? ''}`,
      '-m', `${G.trailers.unit}: ${unit.id}\n${G.trailers.card}: ${card.hash}\n${G.trailers.review}: ${G.pass}`);
    const sha = git(tree, 'rev-parse', 'HEAD');
    dropWorktree(cwd, tree);
    git(cwd, 'merge', '-q', '--ff-only', sha);
    let output = msg('gateMerged', { unit: unit.id, sha });
    const holder = git(cwd, 'worktree', 'list', '--porcelain').split('\n\n').find((w) => w.includes(`branch refs/heads/${branchOf(unit.id)}`));
    if (holder) {
      const path = holder.split('\n')[0].replace(/^worktree /, '');
      try { git(cwd, 'worktree', 'remove', path); } catch (e) { output += msg('gateKept', { path, error: e.message.split('\n')[0] }); }
    }
    tryGit(cwd, 'branch', '-q', '-D', branchOf(unit.id));
    return done(output);
  },

  push(args, { cwd }) {
    const st = readState(cwd);
    const remoteRef = `${G.remote}/${st.base}`;
    const range = tryGit(cwd, 'rev-parse', '-q', '--verify', remoteRef) ? `${remoteRef}..${st.base}` : st.base;
    const findings = historyFindings(cwd, range, st, { merge: 'PUSH-COMMIT', commit: 'PUSH-COMMIT' });
    if (findings.length) return done('', config.exit.findings, findings);
    git(cwd, 'push', '-q', G.remote, st.base);
    return done(msg('pushed', { base: st.base, remote: G.remote }));
  },

  fix(args, { cwd }) {
    const flags = { scope: [], requirement: [] };
    let title = null;
    for (let k = 0; k < args.length; k++) {
      if (args[k] === '--scope' || args[k] === '--requirement') {
        if (!args[k + 1]) throw new UsageError(msg('badFlag', { name: args[k] }));
        flags[args[k].slice(2)].push(args[++k]);
      } else if (args[k].startsWith('--')) throw new UsageError(msg('unknownFlag', { name: args[k] }));
      else title = title ?? args[k];
    }
    if (!title || !flags.scope.length) throw new UsageError(msg('fixUsage', {}));
    const { profile } = loadProfile(cwd);
    const lane = computeLane(flags.scope, profile);
    if (lane.lane === 'full') return done(msg('fixFull', { title, reason: lane.reason }), config.exit.blocked);
    const bundle = bundleOf(cwd, profile);
    const id = nextUnitId(bundle);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const file = join(bundle, config.grid.units, `${id}-${slug}.md`);
    const version = existsSync(join(CLI_DIR, config.init.version)) ? readFileSync(join(CLI_DIR, config.init.version), 'utf8').trim() : 'dev';
    const text = render(readFileSync(join(CLI_DIR, G.fixTemplate), 'utf8'), {
      title: JSON.stringify(title),
      description: JSON.stringify(title),
      why: title,
      scope: flags.scope.map((s) => JSON.stringify(s)).join(', '),
      requirements: flags.requirement.length ? [flags.requirement.join(', ')] : [],
      producer: `aidlc/${version}`,
      at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      level: Object.keys(withDefaults(profile).levels)[0],
    }, G.fixTemplate);
    mkdirSync(join(bundle, config.grid.units), { recursive: true });
    writeFileSync(file, text);
    return done(msg('fixWrote', { path: relative(cwd, file), lane: lane.lane, approve: lane.lane === 'quick' ? [] : [id] }));
  },

  // The CI part of `check --ci`: base history since `profile.adopted`, and architecture on the checked-out tree.
  check(args, { cwd }) {
    if (!args.includes('--ci')) return done('');
    const st = readState(cwd);
    const range = st.profile.adopted ? `${st.profile.adopted}..HEAD` : 'HEAD';
    const findings = [...historyFindings(cwd, range, st, { merge: 'CI-MERGE', commit: 'CI-COMMIT' }), ...architecture(cwd, withDefaults(st.profile), st.bundle)];
    return done('', findings.length ? config.exit.findings : config.exit.ok, findings);
  },
};
