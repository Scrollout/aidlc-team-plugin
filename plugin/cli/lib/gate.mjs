// Merge gate, push, fix and the CI history check (docs/design/verification.md, docs/design/gate.md).
// Settings, codes and messages come from cli.json; project commands come from the owner's profile.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { CLI_DIR, config, done, list, readJson, UsageError, relPath } from './config.mjs';
import { msg, render } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { checkBundle, parseDoc, writeIndexes } from './okf.mjs';
import { computeLane, inside, readPlan, runTarget, spansOf } from './grid.mjs';
import { issueTitle, sync } from './board.mjs';
import { approval, baseOf, branchOf, bump, bundleOf, diffHash, git, keptPass, readState, reviewFocuses, roundsOf, runtimeFile, tryGit, writeJson } from './state.mjs';

const G = config.gate;
const matches = (path, glob) => inside('/' + path, glob);
const finding = (code, path, line, key, data) => ({ code, level: 'error', path, line, message: msg(key, data), fix: G.codes[code].fix });
const projectDir = dirname(config.layers.find((l) => l.from === 'project').path) + '/';

// Proof-revert: with the unit's code reverted, each level that holds a tagged test must fail (docs/design/gate.md).
function proofRevert(tree, card, paths, levels, tagged, bundleRel, add) {
  const isTest = (f) => Object.values(levels ?? {}).some((l) => list(l?.paths).some((g) => matches(f, g)));
  const code = paths.filter((f) => !isTest(f) && !f.startsWith(bundleRel + '/') && !f.startsWith(projectDir));
  const runs = Object.entries(levels ?? {}).filter(([, l]) => l?.run && [...tagged].some((f) => list(l.paths).some((g) => matches(f, g))));
  const skip = card?.lane === 'quick' ? 'proofQuick' : !code.length ? 'proofTests' : !runs.length ? 'proofNoRun' : null;
  if (skip) return { levels: [], note: msg('proofSkipped', { why: msg(skip, {}) }) };
  // Index and files both go back, so a run that checks `git diff` sees a clean tree, not the revert.
  const merged = git(tree, 'write-tree');
  const staged = new Set(git(tree, 'ls-files', '--', ...code).split('\n'));
  const atBase = code.filter((f) => tryGit(tree, 'cat-file', '-e', `HEAD:${f}`) !== null);
  if (atBase.length) git(tree, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...atBase);
  const added = code.filter((x) => !atBase.includes(x) && staged.has(x));
  if (added.length) git(tree, 'rm', '-q', '-f', '--', ...added);
  for (const [level, l] of runs) if (runLevel(tree, level, l, add) === true) add('GATE-PROOF', 'gateProof', { level }); // a skip is no proof
  git(tree, 'read-tree', merged);
  const back = code.filter((f) => staged.has(f));
  if (back.length) git(tree, 'checkout-index', '-f', '--', ...back);
  for (const f of code.filter((x) => !staged.has(x))) rmSync(join(tree, f), { force: true });
  return { levels: runs.map(([level]) => level), note: '' };
}

const shell = (cwd, command) => spawnSync(command, { cwd, shell: true, encoding: 'utf8' }).status === 0;

// A level run: refused while a variable it needs is unset, and failed when its runner reports a skip, so a
// skipped test never counts as passed (docs/design/gate.md). Returns whether the run itself exited 0, or null.
function runLevel(tree, level, l, add) {
  const unset = list(l.needs).filter((v) => !process.env[v]);
  if (unset.length) return add('GATE-RUN', 'gateNeeds', { level, vars: unset.join(', ') }), null;
  const r = spawnSync(l.run, { cwd: tree, shell: true, encoding: 'utf8' });
  const skipped = l.skip && `${r.stdout}\n${r.stderr}`.split('\n').find((line) => new RegExp(l.skip).test(line));
  if (skipped) return add('GATE-SKIP', 'gateSkip', { level, line: skipped.trim() }), null;
  return r.status === 0;
}

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

// Denied edges of the dependency graph the project's `architecture.graph` command prints. An approved
// `except` decision covers the edges it lists as `<from> -> <to>` lines, or the whole boundary if it lists none.
export function boundaryFindings(edges, architecture, approved = new Map()) {
  const out = [];
  for (const [from, to] of edges) {
    for (const b of architecture.boundaries ?? []) {
      const texts = list(b.except).filter((d) => approved.has(d)).map((d) => approved.get(d).split('\n').map((l) => l.replace(/^\s*[-*]\s+|`/g, '').trim()));
      if (texts.some((t) => !t.some((l) => l.includes(G.edge)) || t.includes(`${from}${G.edge}${to}`))) continue;
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
    const approved = new Map(list(arch.boundaries?.flatMap((b) => list(b.except))).map((d) => [d, existsSync(join(cwd, d)) ? readFileSync(join(cwd, d), 'utf8') : ''])
      .filter(([, text]) => text && approval(parseDoc(text)) === 'approved'));
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
const dropWorktree = (cwd, dir) => { tryGit(cwd, 'worktree', 'remove', '--force', dir); rmSync(dirname(dir), { recursive: true, force: true }); }; // with its temp parent

// All gate conditions on a trial merge; returns { findings, tree } with the merged tree left for commit.
function runGate(cwd, st, unit) {
  const { profile, base } = st;
  const p = withDefaults(profile);
  const bundleRel = relPath(git(cwd, 'rev-parse', '--show-toplevel'), st.bundle);
  const out = [];
  const add = (code, key, data, path = relPath(cwd, unit.file)) => out.push(finding(code, path, 1, key, { unit: unit.id, ...data }));

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
  if (card && paths.length && G.lanes.indexOf(diffLane.lane) > G.lanes.indexOf(card.lane)) add('GATE-LANE', 'gateLane', { lane: diffLane.lane, reason: diffLane.reason, card: card.lane });

  const hash = diffHash(cwd, base, unit.id);
  // Quick lane: no reviewer (docs/design/team.md#cost); the diff's own lane is checked above.
  if (card?.lane !== 'quick') {
    const general = roundsOf(unit.review).at(-1);
    if (!general || general.verdict !== G.pass || general.diffHash !== hash) add('GATE-REVIEW', 'gateReview', {});
    else if (card && general.card !== card.hash) add('GATE-CARD', 'gateCardStale', { reviewed: general.card, card: card.hash });
    const needed = reviewFocuses(cwd, p, base, unit.id);
    needed.delete(config.state.focus);
    for (const [focus, why] of needed) {
      const last = roundsOf(unit.review, focus).at(-1);
      if (!last || last.verdict !== G.pass || (last.diffHash !== hash && !keptPass(cwd, p, unit.id, focus, last))) add('GATE-SPECIALIST', 'gateSpecialist', { focus, why });
    }
  }

  const tree = trialWorktree(cwd, base);
  if (tryGit(tree, 'merge', '-q', '--no-ff', '--no-commit', branchOf(unit.id)) === null) {
    tryGit(tree, 'merge', '--abort');
    add('GATE-CONFLICT', 'gateConflict', { base });
    return { findings: out, tree, tested: [], proof: null };
  }

  const { levels } = withDefaults(loadProfile(tree).profile); // from the merge result: a unit may add a test location
  const levelPaths = (level) => list(levels?.[level]?.paths);
  const tagged = new Set();
  for (const ac of card?.lane === 'quick' ? [] : unit.acs) { // a quick-lane card carries no ACs, so no AC tests
    const tag = `${unit.id}/${ac.id}`;
    const files = (tryGit(tree, 'grep', '-l', '-F', tag) ?? '').split('\n').filter((f) => f && !f.startsWith(bundleRel + '/'));
    files.forEach((f) => tagged.add(f));
    if (!files.length) add('GATE-AC', 'gateAc', { tag });
    else if (levelPaths(ac.level).length && !files.some((f) => levelPaths(ac.level).some((g) => matches(f, g)))) {
      add('GATE-LEVEL', 'gateLevel', { tag, files: files.join(', '), level: ac.level });
    }
  }

  // Every level's run in full, as the owner's verification of each unit; a quick unit's ACs name their own commands.
  const tested = Object.entries(levels ?? {}).filter(([, l]) => l?.run);
  for (const [level, l] of tested) if (runLevel(tree, level, l, add) === false) add('GATE-RUN', 'gateRun', { level, command: l.run });
  for (const ac of card?.lane === 'quick' ? unit.acs : []) {
    for (const t of spansOf(unit.doc.lines[ac.line - 1]).map(runTarget).filter(Boolean)) {
      const command = `${t.runner} ${t.name}`;
      if (!shell(tree, command)) add('GATE-AC', 'gateAcCommand', { ac: ac.id, command });
    }
  }

  const proof = out.length ? null : proofRevert(tree, card, paths, levels, tagged, bundleRel, add); // only on a green merge result

  const touched = (p.modules ?? []).filter((m) => paths.some((x) => list(m.paths).some((g) => matches(x, g))));
  for (const m of touched.filter((x) => x.check)) if (!shell(tree, m.check)) add('GATE-CHECK', 'gateCheck', { command: m.check });
  for (const command of list(p.security?.check)) if (!shell(tree, command)) add('GATE-SECURITY', 'gateCheck', { command });
  out.push(...architecture(tree, withDefaults(loadProfile(tree).profile), st.bundle)); // the boundaries as merged

  const treeBundle = join(tree, bundleRel);
  writeIndexes(treeBundle);
  addLogEntry(treeBundle, msg('gateLogEntry', { unit: unit.id, title: String(unit.fm.title ?? '') }));
  for (const command of list(p.regen)) shell(tree, command);
  for (const f of checkBundle(treeBundle, { rules: p.docs?.rules ?? {}, base: tree }).filter((x) => x.level === 'error')) {
    out.push(finding('GATE-OKF', f.path, f.line, 'gateOkf', f));
  }
  return { findings: out, tree, tested: tested.map(([level]) => level), proof };
}

// Base commits in `range` that are neither gate merges in scope nor direct commits on allowed paths.
function historyFindings(cwd, range, st, codes) {
  const bundleRel = relPath(git(cwd, 'rev-parse', '--show-toplevel'), st.bundle);
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
      const doc = unit && tryGit(cwd, 'show', `${sha}:${relPath(git(cwd, 'rev-parse', '--show-toplevel'), unit.file)}`);
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
    if (!unit) throw new UsageError(msg('unknownUnit', { name: args[0] ?? '', dir: relPath(cwd, join(st.bundle, config.grid.units)) }));
    if (git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') !== st.base) throw new UsageError(msg('gateNotBase', { base: st.base }));
    if (!tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unit.id))) throw new UsageError(msg('noBranch', { branch: branchOf(unit.id) }));
    const { findings, tree, tested, proof } = runGate(cwd, st, unit);
    if (findings.length) {
      tryGit(tree, 'merge', '--abort');
      dropWorktree(cwd, tree);
      // Remembered so `next` stops offering this merge until the base or the diff changes.
      const codes = [...new Set(findings.map((f) => f.code))];
      writeJson(runtimeFile(cwd, 'gates', unit.id), { base: git(cwd, 'rev-parse', st.base), diffHash: diffHash(cwd, st.base, unit.id), codes });
      for (const code of codes) bump(cwd, 'codes', code);
      return done('', config.exit.findings, findings);
    }
    const card = readJson(runtimeFile(cwd, 'cards', unit.id));
    git(tree, 'add', '-A');
    git(tree, 'commit', '-q', '-m', `Merge ${unit.id}: ${unit.fm.title ?? ''}`,
      '-m', `${G.trailers.unit}: ${unit.id}\n${G.trailers.card}: ${card.hash}\n${G.trailers.review}: ${card.lane === 'quick' ? G.noReview : G.pass}\n${G.tested}: ${tested.join(', ') || G.noReview}\n${G.proof}: ${proof?.levels.join(', ') || G.noReview}`);
    const sha = git(tree, 'rev-parse', 'HEAD');
    dropWorktree(cwd, tree);
    git(cwd, 'merge', '-q', '--ff-only', sha);
    let output = msg('gateMerged', { unit: unit.id, sha }) + (proof?.note ?? '');
    const holder = git(cwd, 'worktree', 'list', '--porcelain').split('\n\n').find((w) => w.includes(`branch refs/heads/${branchOf(unit.id)}`));
    if (holder) {
      const path = holder.split('\n')[0].replace(/^worktree /, '');
      // Clean tracked files: the host's lock on an agent worktree is no reason to keep it; uncommitted work is.
      const dirty = tryGit(path, 'status', '--porcelain', '--untracked-files=no');
      if (dirty) output += msg('gateKept', { path, error: msg('gateKeptDirty', {}) });
      else try { git(cwd, 'worktree', 'remove', '--force', '--force', path); } catch (e) { output += msg('gateKept', { path, error: e.message.split('\n')[0] }); }
    }
    tryGit(cwd, 'branch', '-q', '-D', branchOf(unit.id));
    // The board follows a merge; it is best effort and never fails one (docs/design/board.md).
    if (st.profile.github) {
      try { output += sync(cwd); } catch (e) { output += msg('boardFailed', { error: e.message.split('\n')[0] }); }
    }
    return done(output);
  },

  push(args, { cwd }) {
    const st = readState(cwd);
    const remoteRef = `${G.remote}/${st.base}`;
    // A base never pushed: only the commits after the one that added the profile, as history before it followed no gate.
    const adding = (tryGit(cwd, 'log', '--diff-filter=A', '--format=%H', st.base, '--', config.layers.find((l) => l.from === 'project').path) ?? '').split('\n').filter(Boolean).at(-1);
    const range = tryGit(cwd, 'rev-parse', '-q', '--verify', remoteRef) ? `${remoteRef}..${st.base}` : adding ? `${adding}..${st.base}` : st.base;
    const findings = historyFindings(cwd, range, st, { merge: 'PUSH-COMMIT', commit: 'PUSH-COMMIT' });
    if (findings.length) return done('', config.exit.findings, findings);
    git(cwd, 'push', '-q', G.remote, st.base);
    return done(msg('pushed', { base: st.base, remote: G.remote }));
  },

  fix(args, { cwd }) {
    const flags = { scope: [], requirement: [], 'from-issue': [] };
    let title = null;
    for (let k = 0; k < args.length; k++) {
      if (args[k].startsWith('--') && args[k].slice(2) in flags) {
        if (!args[k + 1]) throw new UsageError(msg('badFlag', { name: args[k] }));
        flags[args[k].slice(2)].push(args[++k]);
      } else if (args[k].startsWith('--')) throw new UsageError(msg('unknownFlag', { name: args[k] }));
      else title = title ?? args[k];
    }
    const { profile } = loadProfile(cwd);
    const issue = flags['from-issue'].map(Number);
    if (issue.length) title = issueTitle(profile, issue[0]);
    if (!title || !flags.scope.length) throw new UsageError(msg('fixUsage', {}));
    const lane = computeLane(flags.scope, profile); // a full-lane fix waits for the owner's approval like any other unit
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
      issue,
      producer: `aidlc/${version}`,
      at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      level: Object.keys(withDefaults(profile).levels)[0],
    }, G.fixTemplate);
    mkdirSync(join(bundle, config.grid.units), { recursive: true });
    writeFileSync(file, text);
    return done(msg('fixWrote', { path: relPath(cwd, file), lane: lane.lane, approve: lane.lane === 'quick' ? [] : [id] }));
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
