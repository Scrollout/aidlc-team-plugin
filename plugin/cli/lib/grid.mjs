// Grid: reads intent and unit docs, lints the plan and computes lanes (docs/design/grid.md).
// Settings, codes and messages come from cli.json.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { at, bundleOf, config, FULL, QUICK, STANDARD, done, fieldPaths, git, isMap, readJson, tryGit, list, UsageError, relPath } from './config.mjs';
import { finding as codeFinding, msg } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { linksOf, parseDoc, proseLines, sectionOf } from './okf.mjs';

const GRID = config.grid;
const AC = /^\s*[-*]\s+(AC-\d+)\b\s*(?:\(([^)]*)\))?\s*:/;
const RESERVE = /^(\S+)\s+(\S+)\/(\d+)$/;
const SPAN = /`([^`]+)`/g;

// Requirement IDs compare by number: R-018 and R-18 are the same.
export const reqId = (id) => id.replace(/^(R-)0*(\d)/, '$1$2');

// ---- Globs: `**` spans folders, `*` and `?` stay in one, no `/` means any depth unless anchored by a leading `/` ----

function segments(glob) {
  const anchored = /^\.?\//.test(glob);
  let g = glob.replace(/^\.?\//, '');
  if (g.endsWith('/')) g += '**';
  if (!anchored && !g.includes('/')) g = '**/' + g;
  return g.split('/');
}

const tokens = (seg) => [...seg];

// Memoised walk over two token lists; `step(i, j, go)` decides each state.
function walk(a, b, step) {
  const memo = new Map();
  const go = (i, j) => {
    const key = i * (b.length + 1) + j;
    if (!memo.has(key)) {
      memo.set(key, false);
      memo.set(key, i === a.length && j === b.length ? true : step(i, j, go));
    }
    return memo.get(key);
  };
  return go(0, 0);
}

// Some string matches both patterns. `star` is the any-run token, `one` matches one token of the other side.
function intersects(a, b, star, one) {
  return walk(a, b, (i, j, go) => {
    if (a[i] === star) return go(i + 1, j) || (j < b.length && go(i, j + 1));
    if (b[j] === star) return go(i, j + 1) || (i < a.length && go(i + 1, j));
    return i < a.length && j < b.length && one(a[i], b[j]) && go(i + 1, j + 1);
  });
}

// Every string matching `a` matches `b` (sufficient check: `b` must cover each token of `a`).
function within(a, b, star, one) {
  return walk(a, b, (i, j, go) => {
    if (b[j] === star) return go(i, j + 1) || (i < a.length && go(i + 1, j));
    return i < a.length && j < b.length && a[i] !== star && one(a[i], b[j]) && go(i + 1, j + 1);
  });
}

const charOverlap = (x, y) => x === '?' || y === '?' || x === y;
const charWithin = (x, y) => y === '?' ? x !== '*' : x === y;
const segOverlap = (x, y) => intersects(tokens(x), tokens(y), '*', charOverlap);
const segWithin = (x, y) => within(tokens(x), tokens(y), '*', charWithin);

export const overlaps = (a, b) => intersects(segments(a), segments(b), '**', segOverlap);
export const inside = (a, b) => within(segments(a), segments(b), '**', segWithin);
// A back-fill: units whose scopes all lie inside the levels' test paths, so they ship no code (docs/design/backfill.md).
export const testsOnly = (units, profile) => units.length > 0 && units.every((u) => u.scope.length
  && u.scope.every((g) => Object.values(withDefaults(profile).levels).some((l) => list(l?.paths).some((p) => inside(g, p)))));
// The running product: module paths and one-way doors. A unit whose scope reaches none of it ships nothing (U76, U83).
export const productGlobs = (profile) => [...(profile.modules ?? []).flatMap((m) => list(m.paths)), ...list(profile.decisions?.paths ?? profile.lanes?.full)];
// Units that ship nothing: all tests, or, when the profile names modules, all outside the product (docs/design/operations.md).
export const shipsNothing = (units, profile) => testsOnly(units, profile) || (units.length > 0 && (profile.modules ?? []).length > 0
  && units.every((u) => u.scope.length && !u.scope.some((s) => productGlobs(profile).some((g) => overlaps(s, g)))));

// A scope holding the project profile can add its own test location to `levels` (docs/design/grid.md).
const PROFILE = '/' + config.layers.find((l) => l.name === 'project').path;

// ---- Plan ----

function readDocs(bundle, dir, pattern) {
  const d = join(bundle, dir);
  if (!existsSync(d)) return [];
  const re = new RegExp(pattern);
  return readdirSync(d).sort().flatMap((name) => {
    const m = name.match(re);
    if (!m) return [];
    const file = join(d, name);
    const doc = parseDoc(readFileSync(file, 'utf8'));
    return doc.error || !doc.fm ? [] : [{ id: m[1], file, fm: doc.fm, doc, requirements: list(doc.fm.requirements).map(reqId) }];
  });
}

export function acsOf(doc) {
  return proseLines(doc.lines, doc.body).flatMap(([line, text]) => {
    const m = text.match(AC);
    return m ? [{ id: m[1], level: m[2]?.trim(), line, text }] : [];
  });
}

// A unit's plan fields and ACs, as its doc gives them.
export const unitFields = (doc) => ({ fm: doc.fm, depends: list(doc.fm.depends), scope: list(doc.fm.scope), reserves: list(doc.fm.reserves), modules: list(doc.fm.modules), acs: acsOf(doc) });

// Intents and units of a bundle; units carry their parsed fields and ACs.
export function readPlan(bundle) {
  const requirements = readDocs(bundle, GRID.requirements, GRID.requirementFile);
  // Citations compare by number (R-24 cites R-024.md) and print as the file names the requirement.
  const named = new Map(requirements.map((r) => [reqId(r.id), r.id]));
  const cite = (d) => ({ ...d, requirements: d.requirements.map((r) => named.get(r) ?? r) });
  const units = readDocs(bundle, GRID.units, GRID.unitFile).map((u) => cite({ ...u, ...unitFields(u.doc) }));
  return { intents: readDocs(bundle, GRID.intents, GRID.intentFile).map(cite), units, requirements };
}

// The given docs plus the intents of the units among them: a plan-wide finding lands on the intent (docs/design/plan-lint.md).
export const withIntents = (bundle, files, { intents, units } = readPlan(bundle)) =>
  new Set([...files, ...units.filter((u) => files.includes(u.file)).flatMap((u) => intents.filter((i) => i.id === u.fm.intent).map((i) => i.file))]);

const finding = (code, file, line, key, data, base) => codeFinding(GRID.codes, code, relPath(base, file), line, key, data);

const keyLine = (u, key) => {
  const k = u.doc.lines.slice(0, u.doc.body).findIndex((l) => l.startsWith(`${key}:`));
  return k < 0 ? 1 : k + 1;
};

function reachable(units) {
  const deps = new Map(units.map((u) => [u.id, u.depends]));
  const memo = new Map();
  const reach = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    const out = new Set();
    for (const d of deps.get(id) ?? []) {
      if (seen.has(d)) continue;
      out.add(d);
      for (const x of reach(d, new Set([...seen, id]))) out.add(x);
    }
    memo.set(id, out);
    return out;
  };
  return reach;
}

export const spansOf = (line) => [...line.matchAll(SPAN)].map((m) => m[1].trim());

// `make docs-check` and the like: the runner, its build file (grid.runners) and the target.
export function runTarget(span) {
  for (const [runner, file] of Object.entries(GRID.runners)) {
    const m = span.match(new RegExp(`^${runner.replace(/ /g, '\\s+')}\\s+([\\w:.-]+)`));
    if (m) return { runner, file, name: m[1] };
  }
}

export function definedOnBase(root, t) {
  const file = join(root, t.file);
  const name = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.json')) { try { return JSON.parse(text).scripts?.[t.name] !== undefined; } catch { return false; } } // package.json scripts
  return new RegExp(`^\\s*"?${name}"?(?=[\\s:])[^\\n=]*:`, 'm').test(text);
}

// The unit makes what the span names: a path in its scope, or a target its doc names whose build file it may write.
function makes(u, span, t, spans) {
  if (t) return u.scope.some((g) => overlaps('/' + t.file, g)) && spans.some((s) => runTarget(s)?.file === t.file && runTarget(s).name === t.name);
  return /^[^\s]*[/.][^\s]*$/.test(span) && u.scope.some((g) => inside('/' + span.replace(/^\.?\//, ''), g));
}

function cycles(units) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const found = new Map();
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, 'open');
    stack.push(id);
    for (const d of byId.get(id).depends.filter((x) => byId.has(x))) {
      if (state.get(d) === 'open') {
        const cycle = stack.slice(stack.indexOf(d));
        const start = cycle.indexOf([...cycle].sort()[0]);
        const ring = [...cycle.slice(start), ...cycle.slice(0, start)];
        found.set(ring.join(), ring);
      } else if (!state.has(d)) visit(d);
    }
    stack.pop();
    state.set(id, 'done');
  };
  for (const u of units) if (!state.has(u.id)) visit(u.id);
  return [...found.values()].map((ring) => ({ unit: byId.get(ring[0]), text: [...ring, ring[0]].join(' → ') }));
}

// Plan lint over live units: all but `status: dropped` and `skip` (the merged ones, from git).
export function lintPlan(bundle, profile = {}, { skip = [], base = process.cwd() } = {}) {
  const { units: all, intents, requirements } = readPlan(bundle);
  const units = all.filter((u) => u.fm.status !== GRID.dropped && !skip.includes(u.id));
  const known = new Set(all.map((u) => u.id));
  const levels = Object.keys(withDefaults(profile).levels);
  const kinds = profile.reserve ? Object.keys(profile.reserve) : null;
  const modules = new Set((profile.modules ?? []).map((m) => String(m.id ?? m.name)));
  const levelDefs = withDefaults(profile).levels;
  const out = [];
  const add = (code, u, line, key, data) => out.push(finding(code, u.file, line, key, { unit: u.id, ...data }, base));
  const bundleRel = relPath(base, bundle);

  for (const u of units) {
    for (const dep of u.depends.filter((d) => !known.has(d))) add('PLAN-DAG', u, keyLine(u, 'depends'), 'depUnknown', { dep });
    const seen = new Set();
    for (const ac of u.acs) {
      if (seen.has(ac.id)) add('PLAN-AC', u, ac.line, 'acDuplicate', { ac: ac.id });
      seen.add(ac.id);
      if (!ac.level) add('PLAN-LEVEL', u, ac.line, 'acNoLevel', { ac: ac.id });
      else if (!levels.includes(ac.level)) add('PLAN-LEVEL', u, ac.line, 'acBadLevel', { ac: ac.id, level: ac.level, levels: levels.join(', ') });
    }
    for (const m of u.modules.filter((x) => !modules.has(x))) add('PLAN-MODULE', u, keyLine(u, 'modules'), 'moduleUnknown', { module: m, modules: [...modules].join(', ') || '-' });
    if (!u.scope.length) add('PLAN-SCOPE', u, 1, 'scopeMissing', {});
    // Each AC's test must have a place in the scope, unless the quick lane adds no tests.
    else if (computeLane(u.scope, profile).lane !== QUICK) {
      for (const ac of u.acs.filter((a) => levels.includes(a.level))) {
        const paths = list(levelDefs[ac.level].paths);
        if (paths.length && !u.scope.some((g) => overlaps(g, PROFILE) || paths.some((p) => overlaps(g, p)))) add('PLAN-TEST', u, ac.line, 'acNoTestPath', { ac: ac.id, level: ac.level, paths: paths.join(', ') });
      }
    }
    // Design rows before code: an unapproved unit carries its lane's design sections, or a reason it needs none (U72).
    if (u.scope.length && !u.fm.verified_hash && !u.fm[GRID.design]) {
      const lane = computeLane(u.scope, profile).lane;
      for (const section of GRID.designRows[lane] ?? []) {
        if (!sectionOf(u.doc, section).some(([, t]) => t.trim())) add('PLAN-DESIGN', u, 1, 'planDesign', { lane, section });
      }
    }
    // Builders never write what merge writes: bundle indexes and logs, and profile.shared files.
    for (const glob of u.scope) {
      const last = glob.split('/').at(-1);
      const inBundle = glob.startsWith(bundleRel + '/') || glob.startsWith('**');
      if ((inBundle && [config.okf.index, config.okf.log].includes(last)) || list(profile.shared).includes(glob)) add('PLAN-SHARED', u, keyLine(u, 'scope'), 'planShared', { glob });
    }
  }
  if (requirements.length) {
    const known = new Set(requirements.map((r) => r.id));
    for (const d of [...intents.filter((i) => i.fm.status !== GRID.dropped), ...units]) {
      if (!d.requirements.length) add('PLAN-REQ', d, 1, 'reqNone', { doc: d.id });
      for (const req of d.requirements.filter((r) => !known.has(r))) add('PLAN-REQ', d, keyLine(d, 'requirements'), 'reqUnknown', { doc: d.id, req });
    }
  }
  // With a board, each live unit carries the values it maps, except the derived wave (docs/design/board.md).
  // The example uses the profile's own map, so the lead writes a value the board knows.
  const planned = Object.entries(profile.github?.fields ?? {}).map(([field, spec]) => ({ field, path: fieldPaths({ field: spec })[0], map: spec.map }))
    .filter((f) => f.path !== config.board.wave);
  for (const u of units) {
    for (const { field, path, map } of planned.filter((f) => at(u.fm, f.path) === undefined)) {
      const value = map ? Object.keys(map)[0] : msg('planBoardAny', {});
      const example = path.split('.').reduceRight((inner, key, k) => (k ? `{ ${key}: ${inner} }` : `${key}: ${inner}`), value);
      const mapping = map ? msg('planBoardMap', { pairs: Object.entries(map).map(([from, to]) => msg('planBoardPair', { from, to })).join(', ') }) : '';
      add('PLAN-BOARD', u, 1, 'planBoard', { path, field, example, mapping });
    }
  }
  // A value must be an option the Project has, as the last sync read them; no sync yet, no check.
  const common = tryGit(base, 'rev-parse', '--git-common-dir');
  const options = (common && readJson(join(resolve(base, common), config.state.dir, config.state.board))?.options) ?? {};
  for (const u of units) {
    for (const { field, path, map } of planned.filter((f) => options[f.field] && at(u.fm, f.path) !== undefined)) {
      const value = map ? map[String(at(u.fm, path))] : at(u.fm, path);
      if (value !== undefined && !options[field].includes(String(value))) add('PLAN-BOARD', u, 1, 'planBoardOption', { path, value, field, options: options[field].join(', ') });
    }
  }
  // A unit at a one-way door links a Decision doc or says why it is two-way (docs/design/approvals.md). Focus globs
  // alone are no door: they get a deeper review, not a decision.
  const doorGlobs = list(profile.decisions?.paths ?? profile.lanes?.full);
  for (const u of units.filter((x) => !x.fm[GRID.twoWay])) {
    const links = linksOf(u, bundle);
    if (links.some((f) => parseDoc(existsSync(f) ? readFileSync(f, 'utf8') : '').fm?.type === GRID.decisionType)) continue;
    const owner = (door) => u.scope.find((s) => overlaps(s, door) || overlaps('/' + door, s));
    const door = doorGlobs.find(owner) ?? linksOf(u, bundle, GRID.interfaces).map((f) => relPath(base, f)).find((f) => u.scope.some((g) => overlaps('/' + f, g)));
    // A bare name such as `Makefile` matches at any depth, so it reaches into a door folder (first migration).
    const glob = door && owner(door);
    if (door) add('PLAN-DECISION', u, keyLine(u, 'scope'), 'planDecision', { door, glob, bare: /^[^/*]+$/.test(glob) ? msg('planDecisionBare', { glob }) : '' });
  }
  // Each intent ends to end once: an AC at the top level that runs; a unit crossing modules is tested above the
  // first level (docs/design/plan-lint.md).
  const top = levels.filter((l) => levelDefs[l]?.run).at(-1);
  const wide = withDefaults(profile).plan.sliceUnits;
  const fixes = new Set(units.filter((u) => !u.fm.intent).map((u) => u.id));
  for (const u of units.filter((x) => x.fm.intent)) for (const dep of u.depends.filter((d) => fixes.has(d))) add('PLAN-SLICE', u, keyLine(u, 'depends'), 'planSliceAhead', { dep });
  for (const i of intents.filter((x) => x.fm.status !== GRID.dropped && !x.fm[GRID.slice])) {
    const own = units.filter((u) => u.fm.intent === i.id);
    if (top && own.length && !own.some((u) => u.acs.some((a) => a.level === top))) add('PLAN-SLICE', i, 1, 'planSliceIntent', { level: top });
    // A walking skeleton first: the first end-to-end AC waits on at most half the intent's product units (second project).
    const made = new Set(own.filter((u) => u.scope.some((s) => productGlobs(profile).some((g) => overlaps(s, g)))).map((u) => u.id));
    const wait = Math.min(...own.filter((u) => u.acs.some((a) => a.level === top)).map((u) => [...reachable(own)(u.id)].filter((d) => made.has(d)).length));
    if (top && made.size > 2 && wait > made.size / 2) add('PLAN-SKELETON', i, 1, 'planSkeleton', { level: top, wait, units: made.size });
    // Slices stay vertical: every unit on a thin slice with its own top-level AC, none waiting on a later one (U118).
    if (!top || !made.size) continue;
    const lines = sectionOf(i.doc, GRID.slices).filter(([, t]) => /^\s*([-*]|\d+\.)\s/.test(t)).map(([n, t]) => [n, [...new Set(t.match(/\bU-\d+\b/g))]]);
    const slot = new Map(lines.flatMap(([, ids], k) => ids.map((id) => [id, k])));
    if (!lines.length && own.length > wide) add('PLAN-SLICE', i, 1, 'planSlicesNone', { count: own.length, max: wide });
    for (const u of lines.length ? own.filter((x) => !slot.has(x.id)) : []) add('PLAN-SLICE', u, 1, 'planSlicesOff', { intent: i.id });
    for (const [n, ids] of lines.filter(([, x]) => x.length)) {
      if (!ids.some((id) => all.find((x) => x.id === id)?.acs.some((a) => a.level === top))) add('PLAN-SLICE', i, n, 'planSlicesLayer', { slice: ids.join(', '), level: top });
      if (ids.length > wide) add('PLAN-SLICE', i, n, 'planSlicesWide', { slice: ids.join(', '), count: ids.length, max: wide });
    }
    for (const u of own) for (const dep of u.depends.filter((d) => slot.get(d) > slot.get(u.id))) add('PLAN-SLICE', u, keyLine(u, 'depends'), 'planSlicesOrder', { dep });
  }
  // The waiver is for work outside the running product: a new unit reaching a module or a one-way door voids it.
  const product = productGlobs(profile);
  for (const i of top ? intents.filter((x) => x.fm.status !== GRID.dropped && x.fm[GRID.slice]) : []) {
    for (const u of units.filter((x) => x.fm.intent === i.id && !x.fm.verified_hash)) {
      const area = product.find((g) => u.scope.some((s) => overlaps(s, g)));
      if (area) add('PLAN-SLICE', u, keyLine(u, 'scope'), 'planSliceWaiver', { intent: i.id, glob: u.scope.find((s) => overlaps(s, area)), area, level: top });
    }
  }
  // With a deploy, each live intent links its runbook and the profile says where the target is defined (docs/design/operations.md).
  const live = (i) => units.some((u) => u.fm.intent === i.id) || !all.some((u) => u.fm.intent === i.id);
  for (const i of profile.deploy ? intents.filter((x) => x.fm.status !== GRID.dropped && live(x) && !shipsNothing(all.filter((u) => u.fm.intent === x.id), profile)) : []) {
    if (!linksOf(i, bundle).some((f) => existsSync(f) && parseDoc(readFileSync(f, 'utf8')).fm?.type === GRID.runbookType)) add('PLAN-RUNBOOK', i, 1, 'planRunbook', {});
    if (!Object.hasOwn(profile.deploy, 'platform')) add('PLAN-PLATFORM', i, 1, 'planPlatform', {});
  }
  for (const u of units.filter((x) => x.modules.length > 1 && x.acs.length && x.acs.every((a) => a.level === levels[0]))) {
    add('PLAN-SLICE', u, keyLine(u, 'modules'), 'planSliceUnit', { modules: u.modules.join(', '), level: levels[0] });
  }
  // A generator links outputs to sources: a scope names both sides or neither. An existing file git does not
  // track is no output a builder can commit (docs/design/plan-lint.md).
  const tracked = tryGit(base, 'ls-files');
  const files = tracked === null ? null : new Set(tracked.split('\n')); // outside a git work tree there is nothing to compare with
  for (const u of units) {
    const touches = (globs) => list(globs).filter((g) => u.scope.some((s) => overlaps(s, g)));
    for (const entry of (Array.isArray(profile.generated) ? profile.generated : []).filter(isMap)) {
      const [outs, srcs] = [touches(entry.outputs), touches(entry.sources)];
      if (outs.length && !srcs.length) add('PLAN-GENERATED', u, keyLine(u, 'scope'), 'planGenerated', { has: outs.join(', '), lacks: list(entry.sources).join(', ') });
      if (srcs.length && !outs.length) add('PLAN-GENERATED', u, keyLine(u, 'scope'), 'planGenerated', { has: srcs.join(', '), lacks: list(entry.outputs).join(', ') });
    }
    // A leading slash anchors a file at the root (PLAN-SCOPE suggests `/Makefile`); git lists it without one.
    const untracked = (s) => !/[*?[]/.test(s) && !files.has(s.replace(/^\//, '')) && existsSync(join(base, s));
    for (const path of files ? u.scope.filter(untracked) : []) add('PLAN-GENERATED', u, keyLine(u, 'scope'), 'planUntracked', { path });
  }
  for (const c of cycles(units)) add('PLAN-DAG', c.unit, keyLine(c.unit, 'depends'), 'depCycle', { cycle: c.text });

  const held = new Map();
  for (const u of units) {
    for (const reserve of u.reserves) {
      const m = reserve.match(RESERVE);
      const line = keyLine(u, 'reserves');
      if (!m) add('PLAN-RESERVE', u, line, 'reserveMalformed', { reserve });
      else if (kinds && !kinds.includes(m[1])) add('PLAN-RESERVE', u, line, 'reserveKind', { kind: m[1] });
      else {
        const key = `${m[1]} ${m[2]}/${Number(m[3])}`;
        if (held.has(key)) add('PLAN-RESERVE', u, line, 'reserveDuplicate', { reserve, other: held.get(key) });
        else held.set(key, u.id);
      }
    }
  }

  // An AC that names another unit's output needs that unit merged first.
  const reach = reachable(units);
  const spans = new Map(units.map((u) => [u.id, proseLines(u.doc.lines, u.doc.body).flatMap(([n]) => spansOf(u.doc.lines[n - 1]))]));
  for (const u of units) {
    for (const ac of u.acs) {
      for (const span of spansOf(u.doc.lines[ac.line - 1])) {
        const t = runTarget(span);
        if ((t && definedOnBase(base, t)) || makes(u, span, t, spans.get(u.id))) continue;
        for (const o of units.filter((x) => x !== u && !reach(u.id).has(x.id) && makes(x, span, t, spans.get(x.id)))) {
          add('PLAN-DEPENDS', u, ac.line, 'acNeedsUnit', { ac: ac.id, span, other: o.id });
        }
      }
    }
  }
  const bare = (g) => !/[/*?[]/.test(g);
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const [a, b] = [units[i], units[j]];
      // Across intents and fix units, next keeps overlapping scopes apart at run time (U118).
      if (!a.fm.intent || a.fm.intent !== b.fm.intent || reach(a.id).has(b.id) || reach(b.id).has(a.id)) continue;
      const pair = a.scope.flatMap((g) => b.scope.filter((h) => overlaps(g, h)).map((h) => [g, h]))[0];
      if (!pair) continue;
      // A bare name matches at any depth; anchored with `/` it may no longer overlap.
      const loose = [[pair[1], pair[0]], pair].find(([x, y]) => bare(x) && !overlaps('/' + x, y));
      add('PLAN-SCOPE', b, keyLine(b, 'scope'), loose ? 'scopeOverlapRoot' : 'scopeOverlap', { glob: pair[1], other: a.id, otherGlob: pair[0], root: loose && '/' + loose[0] });
    }
  }
  return out;
}

// ---- Lanes ----

// The lane for a unit's scope globs or a diff's paths, with the glob or path that decided it.
// `paths` marks items as repo paths (from a diff), anchored at the root.
export function computeLane(items, profile = {}, { paths = false } = {}) {
  const anchor = (item) => (paths ? '/' + item : item);
  const full = [
    ...list(profile.lanes?.full).map((glob) => ({ source: 'lanes.full', glob })),
    ...Object.entries(profile.focus ?? {}).flatMap(([f, globs]) => list(globs).map((glob) => ({ source: `focus.${f}`, glob }))),
  ];
  for (const item of items) {
    const hit = full.find((f) => overlaps(anchor(item), f.glob));
    if (hit) return { lane: FULL, reason: msg('laneFull', { item, ...hit }) };
  }
  if (!items.length) return { lane: STANDARD, reason: msg('laneEmpty', {}) };
  const quick = list(profile.lanes?.quick);
  const outside = items.find((item) => !quick.some((g) => inside(anchor(item), g)));
  return outside ? { lane: STANDARD, reason: msg('laneStandard', { item: outside }) } : { lane: QUICK, reason: msg('laneQuick', {}) };
}

// ---- Commands ----

// Live units while no level runs: the gate would run no tests (docs/design/method.md).
function noRun(cwd, bundle, profile, skip) {
  const live = readPlan(bundle).units.some((u) => u.fm.status !== GRID.dropped && !skip.includes(u.id));
  const path = join(cwd, config.layers.find((l) => l.from === 'project').path);
  return live && !Object.values(withDefaults(profile).levels).some((l) => l?.run) ? [finding('PLAN-RUN', path, 1, 'planRun', {}, cwd)] : [];
}

export const commands = {
  lane(args, { cwd }) {
    const { profile } = loadProfile(cwd);
    let items;
    let paths = false;
    if (args[0] === '--diff') {
      paths = true;
      if (!args[1]) throw new UsageError(msg('laneUsage', {}));
      items = git(cwd, 'diff', '--name-only', args[1]).split('\n').filter(Boolean);
    } else if (args[0]) {
      const bundle = bundleOf(cwd, profile);
      const unit = readPlan(bundle).units.find((u) => u.id === args[0]);
      if (!unit) throw new UsageError(msg('unknownUnit', { name: args[0], dir: relPath(cwd, join(bundle, GRID.units)) }));
      items = unit.scope;
    } else throw new UsageError(msg('laneUsage', {}));
    return done(msg('laneLine', computeLane(items, profile, { paths })));
  },

  // Plan lint for `check`: a directory is linted as a bundle; a file inside the profile's bundle reports only itself.
  async check(args, { cwd }) {
    const { profile } = loadProfile(cwd);
    const bundle = bundleOf(cwd, profile);
    const state = await import('./state.mjs');
    const skip = [...state.mergedUnits(cwd, profile.base).keys()]; // merged units are history
    const paths = args.filter((a) => !a.startsWith('--')).map((a) => resolve(cwd, a));
    const findings = [];
    for (const p of (paths.length ? paths : [bundle]).filter((x) => existsSync(x) && statSync(x).isDirectory())) findings.push(...lintPlan(p, profile, { base: cwd, skip }), ...noRun(cwd, p, profile, skip));
    const docs = paths.filter((p) => existsSync(p) && !statSync(p).isDirectory() && p.startsWith(bundle + sep));
    const wanted = new Set([...withIntents(bundle, docs)].map((f) => relPath(cwd, f)));
    if (docs.length) findings.push(...lintPlan(bundle, profile, { base: cwd, skip }).filter((f) => wanted.has(f.path)));
    const dirs = (paths.length ? paths : [bundle]).filter((x) => existsSync(x) && statSync(x).isDirectory());
    const mds = dirs.flatMap((d) => readdirSync(d, { recursive: true }).map((f) => join(d, f)).filter((f) => f.endsWith('.md') && f.startsWith(bundle + sep)));
    findings.push(...state.stampFindings(cwd, profile, [...new Set([...mds, ...docs])]));
    // A card renders only from an approved doc: size the unapproved ones here, before the owner's round.
    const live = readPlan(bundle).units.filter((u) => u.fm.status !== GRID.dropped && !skip.includes(u.id) && state.approval(u.doc) !== 'approved' && [...mds, ...docs].includes(u.file));
    const { cardsOver } = await import('./card.mjs');
    for (const c of cardsOver(cwd, live.map((u) => u.id))) findings.push(finding('PLAN-CARD', live.find((u) => u.id === c.id).file, 1, 'planCard', { unit: c.id, ...c }, cwd));
    return done('', findings.some((f) => f.level === 'error') ? config.exit.findings : config.exit.ok, findings); // a warning does not fail
  },
};
