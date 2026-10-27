// Merge gate, push, fix and the CI history check (docs/design/verification.md, docs/design/gate.md).
// Settings, codes and messages come from cli.json; project commands come from the owner's profile.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { bundleOf, CLI_DIR, config, QUICK, VERDICT, done, lapsed, list, packageFile, readJson, UsageError, relPath } from '../foundation/data.mjs';
import { addedLines, git, gitLines, sh, tryGit } from '../foundation/git.mjs';
import { finding as codeFinding, msg, render } from '../foundation/text.mjs';
import { loadProfile, withDefaults } from '../foundation/profile.mjs';
import { checkBundle, docSlug, nameProblem, parseDoc, writeIndexes } from './bundle.mjs';
import { computeLane, finding as planFinding, incrementLines, lintPlan, noRun, readPlan, runTarget, spansOf, withIntents } from './plan.mjs';
import { cardsOver } from './card.mjs';
import { inside } from '../foundation/glob.mjs';
import { bindingName, writeTrace } from './construction.mjs';
import { writeContextMap, writeGlossary, writeMap } from './map.mjs';
import { generatedRules, glossaryOf, parseFlags } from './naming.mjs';
import { boundaryFindings, exceptDocs, graphOf, kindFindings, layerFindings, moduleFindings, reachFindings } from './architecture.mjs';
import { seam } from '../foundation/seams.mjs';
import { readState } from './flow.mjs';
import { baseOf, branchOf, mergedUnits, unitPaths, worktrees, aidlcDir, baseRedFile, bump, runtimeFile, writeJson } from '../foundation/store.mjs';
import { codeChanges, diffHash, keptPass, verdictCurrent, mutationOf, reviewFocuses, roundsOf } from './review.mjs';
import { approval, stampFindings } from './approval.mjs';

const G = config.gate;
export { boundaryFindings, moduleFindings } from './architecture.mjs'; // the gate's graph checks live in architecture.mjs
const matches = (path, glob) => inside('/' + path, glob);
const finding = (code, path, line, key, data) => codeFinding(G.codes, code, path, line, key, data);
// Text that matches a built-in secret pattern or one in profile.security.secrets (the secrets hook and the gate).
export const secretIn = (text, profile) => [...config.hooks.secrets, ...list(profile.security?.secrets)].some((p) => new RegExp(p, 'i').test(text));

// Proof-revert: with the unit's code reverted, each level that holds a tagged test must fail (docs/design/gate.md).
function proofRevert(tree, card, paths, levels, tagged, bundleRel, add, unit, mutations, compile) {
  const code = codeChanges(paths, levels, bundleRel);
  // Reported mutations replace the revert: for a back-fill, and for a change its revert cannot test, such as wiring (docs/design/backfill.md).
  if (card && card.lane !== QUICK && (!code.length || [mutations].flat().some((m) => m?.ac))) return proofMutate(tree, unit, mutations, levels, add);
  const runs = Object.entries(levels ?? {}).filter(([, l]) => l?.run && [...tagged].some((f) => list(l.paths).some((g) => matches(f, g))));
  const skip = card?.lane === QUICK ? 'proofQuick' : !runs.length ? 'proofNoRun' : null;
  if (skip) return { levels: [], note: msg('proofSkipped', { why: msg(skip, {}) }) };
  // Index and files both go back, so a run that checks `git diff` sees a clean tree, not the revert.
  const merged = git(tree, 'write-tree');
  const staged = new Set(git(tree, 'ls-files', '--', ...code).split('\n'));
  const atBase = code.filter((f) => tryGit(tree, 'cat-file', '-e', `HEAD:${f}`) !== null);
  if (atBase.length) git(tree, 'restore', '--source=HEAD', '--staged', '--worktree', '--', ...atBase);
  const added = code.filter((x) => !atBase.includes(x) && staged.has(x));
  if (added.length) git(tree, 'rm', '-q', '-f', '--', ...added);
  for (const [level, l] of runs) {
    const passed = runLevel(tree, level, l, add);
    if (passed === true) add('GATE-PROOF', 'gateProof', { level }); // a skip is no proof
    // A revert that does not compile proves no AC at run time (docs/design/construction.md#a-proof-that-runs).
    else if (passed === false && compile?.(l) && new RegExp(compile(l)).test(lastRun)) add('PROOF-AC', 'proofAc', { level });
  }
  git(tree, 'read-tree', merged);
  const back = code.filter((f) => staged.has(f));
  if (back.length) git(tree, 'checkout-index', '-f', '--', ...back);
  for (const f of code.filter((x) => !staged.has(x))) rmSync(join(tree, f), { force: true });
  return { levels: runs.map(([level]) => level), note: '' };
}

// A unit that changes only tests: each AC's reported mutation, applied alone, must fail its level (docs/design/backfill.md).
function proofMutate(tree, unit, mutations, levels, add) {
  const ran = new Set();
  let note = '';
  for (const ac of unit.acs) {
    const tag = `${unit.id}/${ac.id}`;
    const m = mutationOf(mutations, tag);
    const file = m?.path && join(tree, m.path);
    const text = file && existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (!text || !m.find || typeof m.replace !== 'string' || text.split(m.find).length !== 2) { add('GATE-PROOF', 'gateProofMutation', { tag }); continue; }
    const l = levels?.[ac.level];
    if (!l?.run) continue; // a level that does not run proves nothing either way
    writeFileSync(file, text.replace(m.find, () => m.replace));
    if (runLevel(tree, ac.level, l, add) === true) add('GATE-PROOF', 'gateProofKept', { tag, level: ac.level });
    else note += msg('proofMutated', { tag, level: ac.level, path: m.path });
    writeFileSync(file, text);
    ran.add(ac.level);
  }
  return { levels: ran.size ? [`${G.mutation} ${[...ran].join(', ')}`] : [], note };
}

// Each failed command's last lines, for the refusal to show where they are (U147).
let failed = [];
let lastRun = ''; // the output of the last level run
const logged = (command, r) => r.status === 0 || (failed.push(`$ ${command} (exit ${r.status})\n${`${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-G.logLines).join('\n')}`), false);
const shell = (cwd, command) => logged(command, sh(cwd, command));

// A level run: refused while a variable it needs is unset, and failed when its runner reports a skip, so a
// skipped test never counts as passed (docs/design/gate.md). Returns whether the run itself exited 0, or null.
function runLevel(tree, level, l, add) {
  const unset = list(l.needs).filter((v) => !process.env[v]);
  if (unset.length) return add('GATE-RUN', 'gateNeeds', { level, vars: unset.join(', ') }), null;
  const r = sh(tree, l.run, Object.fromEntries(Object.entries(G.fresh).map(([k, v]) => [k, [process.env[k], v].filter(Boolean).join(' ')]))); // no cached pass over a revert or mutation
  lastRun = `${r.stdout}\n${r.stderr}`;
  const skipped = l.skip && lastRun.split('\n').find((line) => new RegExp(l.skip).test(line));
  if (skipped) return add('GATE-SKIP', 'gateSkip', { level, line: skipped.trim() }), null;
  return logged(l.run, r);
}

// Paths only `merge` writes: bundle indexes and logs, the codebase map, and the profile's shared files.
export function mergeWritten(path, bundleRel, profile) {
  const name = basename(path);
  return ((name === config.okf.index || name === config.okf.log) && matches(path, `/${bundleRel}/**`))
    || config.map.pages.some((pg) => path === `${bundleRel}/${(typeof profile.map === 'string' ? profile.map : config.map.file).replace(/\.md$/, '')}${pg.suffix}.md`) || list(profile.shared).some((g) => matches(path, g));
}

// Paths a direct (non-unit) commit may touch: the bundle, .aidlc and the files init writes.
export function directAllowed(path, bundleRel) {
  const init = config.init.files.map((f) => render(f.to, { bundle: bundleRel }));
  return matches(path, `/${bundleRel}/**`) || G.direct.some((g) => matches(path, '/' + g))
    || init.includes(path) || [config.init.gitignore, config.init.settings].includes(path);
}

function architecture(cwd, profile, key = 'gateCheck') {
  const arch = profile.architecture;
  if (!arch) return [];
  const out = [];
  if (arch.graph) {
    const { ok, edges } = graphOf(cwd, arch.graph);
    if (!ok) out.push(finding('ARCH-CHECK', '.', 1, key, { command: arch.graph }));
    const approved = new Map(exceptDocs(arch).map((d) => [d, existsSync(join(cwd, d)) ? readFileSync(join(cwd, d), 'utf8') : ''])
      .filter(([, text]) => text && approval(parseDoc(text)) === 'approved'));
    out.push(...boundaryFindings(edges, arch, approved), ...moduleFindings(edges, profile, approved), ...kindFindings(edges, profile), ...layerFindings(edges, profile), ...reachFindings(edges, profile));
  }
  for (const command of list(arch.checks)) if (!shell(cwd, command)) out.push(finding('ARCH-CHECK', '.', 1, key, { command }));
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

// A level that fails on the base alone too is the base's, not the unit's (docs/design/base-ci.md).
function baseFails(cwd, base, level, l) {
  const tree = trialWorktree(cwd, base);
  try { return runLevel(tree, level, l, () => {}) === false; } finally { dropWorktree(cwd, tree); }
}

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

  const paths = unitPaths(cwd, base, unit.id);
  for (const path of paths) {
    if (mergeWritten(path, bundleRel, profile)) add('GATE-SHARED', 'gateShared', { path }, path);
    else if (!unit.scope.some((g) => matches(path, g))) add('SCOPE-OUT', 'gateScope', { path }, path);
  }
  const names = [...[profile.names ?? []].flat().filter((r) => !nameProblem(r)), ...generatedRules(profile, st.bundle)]; // the project's rules and the registry's (docs/design/naming.md)
  const synonyms = glossaryOf(st.bundle).flatMap((e) => e.synonyms.map((word) => ({ ...e, word, re: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') })));
  // Each added line, so a secret written from Bash, which the secrets hook never sees, stops the merge.
  for (const { file, line, text } of addedLines(cwd, `${base}...${branchOf(unit.id)}`)) {
    if (secretIn(text, profile)) add('GATE-SECRET', 'gateSecret', { path: file, line }, file);
    // A static credential between components, outside the tests: identities, not secrets (docs/design/workload-identity.md).
    else if (codeChanges([file], p.levels, bundleRel).length && config.hooks.identity.some((x) => new RegExp(x, 'i').test(text))) add('GATE-IDENTITY', 'gateIdentity', { path: file, line }, file);
    // A name the line adds where a naming rule looks, which its pattern does not match (docs/design/naming.md).
    for (const r of names.filter((x) => x.find && list(x.files).some((g) => matches(file, g)))) {
      for (const m of text.matchAll(new RegExp(r.find, 'g'))) {
        const name = m[1] ?? m[0];
        if (!new RegExp(`^(?:${r.pattern})$`).test(name)) add('GATE-NAME', 'gateName', { path: file, line, rule: r.id, name, pattern: r.pattern, why: r.why ?? '-' }, file);
      }
    }
    // A synonym a domain's glossary says to avoid, on an added line outside the domain docs (docs/design/naming.md#checks).
    if (!file.startsWith(`${bundleRel}/${config.okf.bundle.folders.Domain}/`)) for (const s of synonyms.filter((x) => x.re.test(text))) add('TERM-SYNONYM', 'gateSynonym', { path: file, line, word: s.word, term: s.term, domain: s.domain }, file);
  }
  // A path rule: each file the unit adds or renames under its files (docs/design/naming.md).
  for (const path of gitLines(cwd, 'diff', '--name-only', '--diff-filter=AR', `${base}...${branchOf(unit.id)}`)) {
    for (const r of names.filter((x) => !x.find && list(x.files).some((g) => matches(path, g)) && !new RegExp(`^(?:${x.pattern})$`).test(path))) add('GATE-NAME', 'gateNamePath', { path, rule: r.id, pattern: r.pattern, why: r.why ?? '-' }, path);
  }
  const diffLane = computeLane(paths, profile, { paths: true });
  if (card && paths.length && G.lanes.indexOf(diffLane.lane) > G.lanes.indexOf(card.lane)) add('GATE-LANE', 'gateLane', { lane: diffLane.lane, reason: diffLane.reason, card: card.lane });

  const hash = diffHash(cwd, base, unit.id);
  // Quick lane: no reviewer (docs/design/team.md#cost); the diff's own lane is checked above.
  if (card?.lane !== QUICK) {
    const general = roundsOf(unit.review).at(-1);
    if (general?.verdict !== VERDICT.pass || !verdictCurrent(general, hash, unit.report)) add('GATE-REVIEW', 'gateReview', {});
    else if (card && general.card !== card.hash) add('GATE-CARD', 'gateCardStale', { reviewed: general.card, card: card.hash });
    const needed = reviewFocuses(cwd, p, base, unit.id);
    needed.delete(config.state.focus);
    for (const [focus, why] of needed) {
      const last = roundsOf(unit.review, focus).at(-1);
      if (!last || last.verdict !== VERDICT.pass || (!verdictCurrent(last, hash, unit.report) && !keptPass(cwd, p, unit.id, focus, last))) add('GATE-SPECIALIST', 'gateSpecialist', { focus, why });
    }
  }
  // Every security finding, at any confidence, waits for the owner's disposition (docs/design/construction.md).
  const security = p.system ? roundsOf(unit.review, config.state.contentFocus).at(-1) : null;
  const unsettled = (security?.findings ?? []).map((f, k) => [f, `F-${k + 1}`]).filter(([f]) => !f.disposition || lapsed(f.until));
  if (unsettled.length) add('REVIEW-SECURITY', 'reviewSecurity', { findings: unsettled.map(([, id]) => id).join(', ') });
  // No later increment merges before increment 1 runs on its target.
  const intent = p.system && (p.deploy || p.release) ? st.intents.find((i) => i.id === unit.fm.intent) : null;
  const lines = intent ? incrementLines(intent) : [], slot = lines.findIndex((l) => l.ids.includes(unit.id));
  if (slot > 0 && !intent.shipped(lines[0].ids)) add('INCR-DONE', 'incrDone', { increment: lines[slot].id ?? slot + 1, intent: intent.id });

  const tree = trialWorktree(cwd, base);
  if (tryGit(tree, 'merge', '-q', '--no-ff', '--no-commit', branchOf(unit.id)) === null) {
    tryGit(tree, 'merge', '--abort');
    add('GATE-CONFLICT', 'gateConflict', { base, branch: branchOf(unit.id) });
    return { findings: out, tree, tested: [], proof: null };
  }

  // What merge writes comes first and is staged, so each check sees the tree that will be committed (docs/design/gate.md).
  const treeBundle = join(tree, bundleRel);
  for (const write of [writeMap, writeGlossary, writeContextMap, writeTrace]) write(tree, withDefaults(loadProfile(tree).profile)); // before the indexes, which list them
  writeIndexes(treeBundle);
  addLogEntry(treeBundle, msg('gateLogEntry', { unit: unit.id, title: String(unit.fm.title ?? '') }));
  for (const command of list(p.regen)) shell(tree, command);
  git(tree, 'add', '-A');

  const merged = withDefaults(loadProfile(tree).profile); // from the merge result: a unit may add a test location
  const { levels } = merged;
  const levelPaths = (level) => list(levels?.[level]?.paths);
  const tagged = new Set();
  for (const ac of card?.lane === QUICK ? [] : unit.acs) { // a quick-lane card carries no ACs, so no AC tests
    const tag = `${unit.id}/${ac.id}`;
    const files = gitLines(tree, 'grep', '-l', '-F', tag).filter((f) => !f.startsWith(bundleRel + '/'));
    files.forEach((f) => tagged.add(f));
    if (!files.length) add('GATE-AC', 'gateAc', { tag });
    else if (!levelPaths(ac.level).length && levels?.[ac.level]?.run) add('GATE-LEVEL', 'gateLevelNoPaths', { tag, level: ac.level }); // proof needs the paths
    else if (levelPaths(ac.level).length && !files.some((f) => levelPaths(ac.level).some((g) => matches(f, g)))) {
      add('GATE-LEVEL', 'gateLevel', { tag, files: files.join(', '), level: ac.level });
    }
  }

  // Every level's run in full, as the owner's verification of each unit; a quick unit's ACs name
  // their own commands (U60), and the first level, as a quick change can break a test that reads it (U114).
  const tested = Object.entries(levels ?? {}).filter(([, l]) => l?.run).slice(0, card?.lane === QUICK ? 1 : undefined);
  for (const [level, l] of tested) {
    if (runLevel(tree, level, l, add) !== false) continue;
    if (!baseFails(cwd, base, level, l)) add('GATE-RUN', 'gateRun', { level, command: l.run });
    else add('GATE-BASE', 'gateBase', { level, command: l.run }), (out.at(-1).red = level); // recorded by merge
  }
  for (const ac of card?.lane === QUICK ? unit.acs : []) {
    for (const t of spansOf(unit.doc.lines[ac.line - 1]).map(runTarget).filter(Boolean)) {
      const command = `${t.runner} ${t.name}`;
      if (!shell(tree, command)) add('GATE-AC', 'gateAcCommand', { ac: ac.id, command });
    }
  }

  const proof = out.length ? null : proofRevert(tree, card, paths, levels, tagged, bundleRel, add, unit, readJson(runtimeFile(cwd, 'reports', unit.id))?.mutations, p.system && ((l) => l.compileError ?? seam('proofPatterns', p).map((pattern) => pattern(tree)).find(Boolean))); // only on a green merge result

  const touched = (p.modules ?? []).filter((m) => paths.some((x) => list(m.paths).some((g) => matches(x, g))));
  for (const command of [...touched.filter((x) => x.check).map((m) => m.check), ...list(p.checks)]) if (!shell(tree, command)) add('GATE-CHECK', 'gateCheck', { command }); // the touched modules', then the project's on every merge (U140)
  for (const command of list(p.security?.check)) if (!shell(tree, command)) add('GATE-SECURITY', 'gateCheck', { command });
  for (const command of list(p.deps?.check)) if (!shell(tree, command)) add('GATE-DEPENDENCY', 'depsCheck', { command }); // docs/design/dependencies.md
  out.push(...architecture(tree, merged)); // the boundaries as merged
  // An exception is approved on the base before the merge that needs it; one only on the unit branch cannot be (docs/design/architecture.md).
  for (const d of new Set(exceptDocs(merged.architecture ?? {}))) {
    if (tryGit(cwd, 'cat-file', '-e', `${base}:${d}`) === null && existsSync(join(tree, d))) add('ARCH-BOUNDARY', 'archExceptInUnit', { doc: d }, d);
  }

  for (const f of checkBundle(treeBundle, { rules: p.docs?.rules ?? {}, caps: p.docs?.caps, base: tree, v2: Boolean(p.system), strict: true }).filter((x) => x.level === 'error')) {
    out.push(finding('GATE-OKF', f.path, f.line, 'gateOkf', f));
  }
  // The published API on the merged tree speaks the grammar of decision 0014 (docs/design/naming.md#checks).
  for (const f of seam('gateChecks', p).flatMap((check) => check(tree, p, paths))) out.push(finding(f.code, f.path, 1, f.key, f.data)); // the extensions' checks on the merge result
  return { findings: out, tree, tested: tested.map(([level]) => level), proof, card };
}

// Base commits in `range` that are neither gate merges in scope nor direct commits on allowed paths.
function historyFindings(cwd, range, st, codes) {
  const top = git(cwd, 'rev-parse', '--show-toplevel');
  const bundleRel = relPath(top, st.bundle);
  const out = [];
  const shas = gitLines(cwd, 'rev-list', '--first-parent', '--reverse', range);
  for (const sha of shas) {
    const parents = git(cwd, 'rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
    const changed = gitLines(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', '--root', ...(parents.length ? [parents[0]] : []), sha);
    const short = sha.slice(0, 12);
    if (parents.length > 1) {
      const trailers = git(cwd, 'log', '-1', '--format=%(trailers:only,unfold)', sha);
      const value = (key) => trailers.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1]?.trim();
      for (const t of Object.values(G.trailers)) if (!value(t)) out.push(finding(codes.merge, '.', 1, 'ciTrailer', { sha: short, trailer: t }));
      const unitId = value(G.trailers.unit);
      const unit = unitId && st.units.find((u) => u.id === unitId);
      if (unitId && !unit) out.push(finding(codes.merge, '.', 1, 'ciUnknownUnit', { sha: short, unit: unitId }));
      const doc = unit && tryGit(cwd, 'show', `${sha}:${relPath(top, unit.file)}`);
      const scope = doc ? list(parseDoc(doc + '\n').fm?.scope) : [];
      for (const path of changed) if (unit && !mergeWritten(path, bundleRel, st.profile) && !scope.some((g) => matches(path, g))) out.push(finding(codes.merge, path, 1, 'ciScope', { sha: short, unit: unitId, path }));
    } else for (const path of changed.filter((x) => !directAllowed(x, bundleRel))) out.push(finding(codes.commit, path, 1, 'ciCommit', { sha: short, path }));
  }
  return out;
}

// The next work item: B-<n> in a v2 project (or by `new bolt`), numbered on from every unit and bolt, else U-<n>.
function nextUnitId(bundle, bolt) {
  const ids = readPlan(bundle).units.map((u) => Number(u.id.split('-')[1]));
  return `${bolt ? config.grid.boltPrefix : 'U-'}${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

// Plan lint for `check`, with what the state and the cards know: a directory is linted as a bundle; a file inside the
// profile's bundle reports only itself.
export async function planCheck(args, { cwd }) {
  const { profile } = loadProfile(cwd);
  const bundle = bundleOf(cwd, profile);
  const skip = [...mergedUnits(cwd, profile.base).keys()]; // merged units are history
  const paths = args.filter((a) => !a.startsWith('--')).map((a) => resolve(cwd, a));
  const findings = [];
  const dirs = (paths.length ? paths : [bundle]).filter((x) => existsSync(x) && statSync(x).isDirectory());
  for (const p of dirs) findings.push(...lintPlan(p, profile, { base: cwd, skip }), ...noRun(cwd, p, profile, skip));
  const docs = paths.filter((p) => existsSync(p) && !statSync(p).isDirectory() && p.startsWith(bundle + sep));
  const wanted = new Set([...withIntents(bundle, docs)].map((f) => relPath(cwd, f)));
  if (docs.length) findings.push(...lintPlan(bundle, profile, { base: cwd, skip }).filter((f) => wanted.has(f.path)));
  const mds = dirs.flatMap((d) => readdirSync(d, { recursive: true }).map((f) => join(d, f)).filter((f) => f.endsWith('.md') && f.startsWith(bundle + sep)));
  findings.push(...stampFindings(cwd, profile, [...new Set([...mds, ...docs])]));
  // Size every unit not yet merged: before the owner's round, and after a rule or template change grew an approved card.
  const live = readPlan(bundle).units.filter((u) => u.fm.status !== config.grid.dropped && !skip.includes(u.id) && [...mds, ...docs].includes(u.file));
  for (const c of cardsOver(cwd, live.map((u) => u.id))) findings.push(planFinding('PLAN-CARD', live.find((u) => u.id === c.id).file, 1, 'planCard', { unit: c.id, ...c }, cwd));
  return done('', findings.some((f) => f.level === 'error') ? config.exit.findings : config.exit.ok, findings); // a warning does not fail
}

export const commands = {
  merge(args, { cwd }) {
    const st = readState(cwd);
    const unit = st.units.find((u) => u.id === args[0]);
    if (!unit) throw new UsageError(msg('unknownUnit', { name: args[0] ?? '', dir: relPath(cwd, join(st.bundle, config.grid.units)) }));
    if (git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD') !== st.base) throw new UsageError(msg('gateNotBase', { base: st.base }));
    if (!tryGit(cwd, 'rev-parse', '-q', '--verify', branchOf(unit.id))) throw new UsageError(msg('noBranch', { branch: branchOf(unit.id) }));
    const marker = join(aidlcDir(cwd), config.state.merging); // the guard refuses a commit on the base while the gate runs (U144)
    writeFileSync(marker, unit.id);
    const { findings, tree, tested, proof, card } = (() => { try { return runGate(cwd, st, unit); } finally { rmSync(marker, { force: true }); } })();
    if (findings.length) {
      tryGit(tree, 'merge', '--abort');
      dropWorktree(cwd, tree);
      // Remembered so `next` stops offering this merge until the base or the diff changes.
      const codes = [...new Set(findings.map((f) => f.code))];
      writeJson(runtimeFile(cwd, 'gates', unit.id), { base: git(cwd, 'rev-parse', st.base), diffHash: diffHash(cwd, st.base, unit.id), codes, at: new Date().toISOString() });
      for (const code of codes) bump(cwd, 'codes', code);
      if (st.profile.system) bump(cwd, config.retro.refusals, { unit: unit.id, binding: bindingName(unit, st.profile), codes: codes.join(', '), at: new Date().toISOString() }); // the retro counts them by binding
      const red = findings.find((f) => f.code === 'GATE-BASE');
      if (red) writeJson(baseRedFile(cwd), { sha: git(cwd, 'rev-parse', st.base), unit: unit.id, level: red.red, at: new Date().toISOString() });
      const log = join(aidlcDir(cwd), 'gates', `${unit.id}.log`); // the failed commands' last lines, beside the refusal (U147)
      return done(failed.length ? (writeFileSync(log, failed.join('\n\n') + '\n'), msg('gateLog', { path: relPath(cwd, log) })) : '', config.exit.findings, findings);
    }
    git(tree, 'add', '-A');
    git(tree, 'commit', '-q', '-m', msg('mergeSubject', { unit: unit.id, title: unit.fm.title ?? '' }),
      '-m', `${G.trailers.unit}: ${unit.id}\n${G.trailers.card}: ${card.hash}\n${G.trailers.review}: ${card.lane === QUICK ? G.noReview : VERDICT.pass}\n${G.tested}: ${tested.join(', ') || G.noReview}\n${G.proof}: ${proof?.levels.join(', ') || G.noReview}`);
    const sha = git(tree, 'rev-parse', 'HEAD');
    dropWorktree(cwd, tree);
    git(cwd, 'merge', '-q', '--ff-only', sha);
    let output = msg('gateMerged', { unit: unit.id, sha }) + (proof?.note ?? '');
    const path = worktrees(cwd).get(branchOf(unit.id));
    if (path) {
      // Clean tracked files: the host's lock on an agent worktree is no reason to keep it; uncommitted work is.
      const dirty = tryGit(path, 'status', '--porcelain', '--untracked-files=no');
      if (dirty) output += msg('gateKept', { path, error: msg('gateKeptDirty', {}) });
      else try { git(cwd, 'worktree', 'remove', '--force', '--force', path); } catch (e) { output += msg('gateKept', { path, error: e.message.split('\n')[0] }); }
    }
    tryGit(cwd, 'branch', '-q', '-D', branchOf(unit.id));
    for (const after of seam('afterMerge', st.profile)) output += after(cwd, st); // the board follows a merge
    return done(output);
  },

  push(args, { cwd }) {
    const st = readState(cwd);
    const remoteRef = `${G.remote}/${st.base}`;
    // A base never pushed: only the commits after the one that added the profile, as history before it followed no gate.
    const adding = gitLines(cwd, 'log', '--diff-filter=A', '--format=%H', st.base, '--', config.layers.find((l) => l.from === 'project').path).at(-1);
    const range = tryGit(cwd, 'rev-parse', '-q', '--verify', remoteRef) ? `${remoteRef}..${st.base}` : adding ? `${adding}..${st.base}` : st.base;
    const findings = historyFindings(cwd, range, st, { merge: 'PUSH-COMMIT', commit: 'PUSH-COMMIT' });
    if (findings.length) return done('', config.exit.findings, findings);
    git(cwd, 'push', '-q', G.remote, st.base);
    return done(msg('pushed', { base: st.base, remote: G.remote }));
  },

  fix(args, { cwd }) {
    const flags = parseFlags(args, 'fix');
    let title = flags._[0] ?? null;
    const { profile } = loadProfile(cwd);
    const issue = list(flags['from-issue']).map(Number), scope = list(flags.scope), reqs = list(flags.requirement);
    if (issue.length) title = seam('issueTitle', profile)[0]?.(profile, issue[0]) ?? null;
    if (!title || !scope.length) throw new UsageError(msg('fixUsage', {}));
    const lane = computeLane(scope, profile); // a full-lane fix waits for the owner's approval like any other unit
    const bundle = bundleOf(cwd, profile);
    const id = nextUnitId(bundle, Boolean(profile.system)), dir = profile.system ? config.grid.bolts : config.grid.units;
    const file = join(bundle, dir, `${id}-${docSlug(title)}.md`);
    const version = existsSync(join(CLI_DIR, config.init.version)) ? readFileSync(join(CLI_DIR, config.init.version), 'utf8').trim() : config.init.devVersion;
    const text = render(readFileSync(packageFile(cwd, 'templates', G.fixTemplate), 'utf8'), {
      title: JSON.stringify(title),
      description: JSON.stringify(title),
      why: title,
      scope: scope.map((s) => JSON.stringify(s)).join(', '),
      requirements: reqs.length ? [reqs.join(', ')] : [],
      issue,
      after: list(flags.after), // the release it fixes (docs/design/operations.md)
      producer: msg('producer', { version }),
      at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      level: Object.keys(withDefaults(profile).levels)[0],
    }, G.fixTemplate);
    mkdirSync(join(bundle, dir), { recursive: true });
    writeFileSync(file, text);
    // The unit as plan lint sees it, so the lead completes what the skeleton cannot know (U58).
    const findings = lintPlan(bundle, profile, { base: cwd, skip: [...mergedUnits(cwd, baseOf(profile)).keys()] }).filter((f) => f.path === relPath(cwd, file));
    const out = msg('fixWrote', { path: relPath(cwd, file), lane: lane.lane, approve: lane.lane === QUICK ? [] : [id] }) + (findings.length ? msg('fixLint', { path: relPath(cwd, file) }) : '');
    return done(out, findings.some((f) => f.level === 'error') ? config.exit.findings : config.exit.ok, findings);
  },

  // A draft bolt from the bolt template, its id the next free number and its file named from the title (docs/design/increments-and-bolts.md).
  new(args, { cwd }) {
    const [kind, title] = args;
    if (kind !== 'bolt' || !title?.trim()) throw new UsageError(msg('newUsage', {}));
    const { profile } = loadProfile(cwd);
    const bundle = bundleOf(cwd, profile), id = nextUnitId(bundle, true);
    const file = join(bundle, config.grid.bolts, `${id}-${docSlug(title)}.md`);
    const text = readFileSync(packageFile(cwd, 'templates', config.grid.boltTemplate), 'utf8').replace(/^title: .*$/m, `title: ${JSON.stringify(title.trim())}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    return done(msg('newWrote', { path: relPath(cwd, file), id }));
  },

  // The CI part of `check --ci`: base history since `profile.adopted`, and architecture on the checked-out tree.
  check(args, { cwd }) {
    if (!args.includes('--ci')) return done('');
    const st = readState(cwd);
    const range = st.profile.adopted ? `${st.profile.adopted}..HEAD` : 'HEAD';
    const findings = [...historyFindings(cwd, range, st, { merge: 'CI-MERGE', commit: 'CI-COMMIT' }), ...architecture(cwd, withDefaults(st.profile), 'archCheckCi'),
      // An advisory published after the merge turns the base red (docs/design/dependencies.md).
      ...list(st.profile.deps?.check).filter((command) => !shell(cwd, command)).map((command) => finding('CI-DEPENDENCY', config.layers.find((l) => l.from === 'project').path, 1, 'depsCheck', { command }))];
    return done('', findings.length ? config.exit.findings : config.exit.ok, findings);
  },
};

// `check --ci` on GitHub Actions: the result as the job summary, for the owner on the run page (docs/design/gate.md).
export const withSummary = (handler) => async (args, ctx) => {
  const r = await handler(args, ctx);
  const file = process.env[G.summaryEnv];
  if (!args.includes('--ci') || !file) return r;
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const [errors, warnings] = ['error', 'warning'].map((l) => r.findings.filter((f) => f.level === l).length);
  const verdict = errors ? msg('summaryFailed', { errors, warnings }) : warnings ? msg('summaryWarned', { warnings }) : msg('summaryPassed', {});
  const shown = r.findings.slice(0, G.summaryMax).map((f) => msg('summaryRow', { mark: f.level === 'error' ? '❌' : '⚠️', code: f.code, path: f.path, line: f.line, message: cell(f.message), fix: cell(f.fix) }));
  const st = readState(ctx.cwd);
  const plan = st.intents.flatMap((i) => [i, ...st.units.filter((u) => u.fm.intent === i.id)]).concat(st.units.filter((u) => !u.fm.intent))
    .map((d) => msg('summaryPlan', { indent: d.fm.intent ? '  ' : '', id: d.id, state: d.state, title: cell(d.fm.title) }));
  const more = r.findings.length > G.summaryMax ? msg('summaryMore', { count: r.findings.length - G.summaryMax }) : '';
  appendFileSync(file, msg('summary', { verdict, rows: shown.length ? [msg('summaryHead', {}), ...shown] : [], more, plan }));
  return r;
};
