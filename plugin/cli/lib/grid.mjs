// Grid: reads intent and unit docs, lints the plan and computes lanes (docs/design/grid.md).
// Settings, codes and messages come from cli.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { at, config, fieldPaths, list, UsageError, relPath } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { parseDoc, proseLines } from './okf.mjs';

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

// ---- Plan ----

function readDocs(bundle, dir, pattern, norm = (id) => id) {
  const d = join(bundle, dir);
  if (!existsSync(d)) return [];
  const re = new RegExp(pattern);
  return readdirSync(d).sort().flatMap((name) => {
    const m = name.match(re);
    if (!m) return [];
    const file = join(d, name);
    const doc = parseDoc(readFileSync(file, 'utf8'));
    return doc.error || !doc.fm ? [] : [{ id: norm(m[1]), file, fm: doc.fm, doc, requirements: list(doc.fm.requirements).map(reqId) }];
  });
}

export function acsOf(doc) {
  return proseLines(doc.lines, doc.body).flatMap(([line, text]) => {
    const m = text.match(AC);
    return m ? [{ id: m[1], level: m[2]?.trim(), line, text }] : [];
  });
}

// Intents and units of a bundle; units carry their parsed fields and ACs.
export function readPlan(bundle) {
  const units = readDocs(bundle, GRID.units, GRID.unitFile).map((u) => ({
    ...u,
    depends: list(u.fm.depends),
    scope: list(u.fm.scope),
    reserves: list(u.fm.reserves),
    modules: list(u.fm.modules),
    acs: acsOf(u.doc),
  }));
  return {
    intents: readDocs(bundle, GRID.intents, GRID.intentFile),
    units,
    requirements: readDocs(bundle, GRID.requirements, GRID.requirementFile, reqId),
  };
}

function finding(code, file, line, key, data, base) {
  return { code, level: GRID.codes[code].level, path: relPath(base, file), line, message: msg(key, data), fix: GRID.codes[code].fix };
}

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

const spansOf = (line) => [...line.matchAll(SPAN)].map((m) => m[1].trim());

// `make docs-check` and the like: the build file (grid.runners) and the target.
function runTarget(span) {
  for (const [runner, file] of Object.entries(GRID.runners)) {
    const m = span.match(new RegExp(`^${runner.replace(/ /g, '\\s+')}\\s+([\\w:.-]+)`));
    if (m) return { file, name: m[1] };
  }
}

function definedOnBase(root, t) {
  const file = join(root, t.file);
  const name = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return existsSync(file) && new RegExp(`^\\s*"?${name}"?(?=[\\s:])[^\\n=]*:`, 'm').test(readFileSync(file, 'utf8'));
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
    if (!u.scope.length) add('PLAN-SCOPE', u, 1, 'scopeMissing', {});
    // Each AC's test must have a place in the scope, unless the quick lane adds no tests.
    else if (computeLane(u.scope, profile).lane !== 'quick') {
      for (const ac of u.acs.filter((a) => levels.includes(a.level))) {
        const paths = list(levelDefs[ac.level].paths);
        if (paths.length && !u.scope.some((g) => paths.some((p) => overlaps(g, p)))) add('PLAN-TEST', u, ac.line, 'acNoTestPath', { ac: ac.id, level: ac.level, paths: paths.join(', ') });
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
  const planned = profile.github ? fieldPaths(profile.github.fields).filter((p) => p !== config.board.wave) : [];
  for (const u of units) for (const path of planned.filter((p) => at(u.fm, p) === undefined)) add('PLAN-BOARD', u, 1, 'planBoard', { path });
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
      if (reach(a.id).has(b.id) || reach(b.id).has(a.id)) continue;
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
    if (hit) return { lane: 'full', reason: msg('laneFull', { item, ...hit }) };
  }
  if (!items.length) return { lane: 'standard', reason: msg('laneEmpty', {}) };
  const quick = list(profile.lanes?.quick);
  const outside = items.find((item) => !quick.some((g) => inside(anchor(item), g)));
  return outside ? { lane: 'standard', reason: msg('laneStandard', { item: outside }) } : { lane: 'quick', reason: msg('laneQuick', {}) };
}

// ---- Commands ----

const bundleOf = (cwd, profile) => resolve(cwd, profile.docs.bundle);

export const commands = {
  lane(args, { cwd }) {
    const { profile } = loadProfile(cwd);
    let items;
    let paths = false;
    if (args[0] === '--diff') {
      paths = true;
      if (!args[1]) throw new UsageError(msg('laneUsage', {}));
      items = execFileSync('git', ['diff', '--name-only', args[1]], { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);
    } else if (args[0]) {
      const bundle = bundleOf(cwd, profile);
      const unit = readPlan(bundle).units.find((u) => u.id === args[0]);
      if (!unit) throw new UsageError(msg('unknownUnit', { name: args[0], dir: relPath(cwd, join(bundle, GRID.units)) }));
      items = unit.scope;
    } else throw new UsageError(msg('laneUsage', {}));
    return { code: config.exit.ok, findings: [], output: msg('laneLine', computeLane(items, profile, { paths })) };
  },

  // Plan lint for `check`: a directory is linted as a bundle; a file inside the profile's bundle reports only itself.
  async check(args, { cwd }) {
    const { profile } = loadProfile(cwd);
    const bundle = bundleOf(cwd, profile);
    const skip = [...(await import('./state.mjs')).mergedUnits(cwd, profile.base).keys()]; // merged units are history
    const paths = args.filter((a) => !a.startsWith('--')).map((a) => resolve(cwd, a));
    const findings = [];
    for (const p of paths.length ? paths : [bundle]) {
      if (!existsSync(p)) continue;
      if (statSync(p).isDirectory()) findings.push(...lintPlan(p, profile, { base: cwd, skip }));
      else if (p.startsWith(bundle + sep)) findings.push(...lintPlan(bundle, profile, { base: cwd, skip }).filter((f) => f.path === relPath(cwd, p)));
    }
    return { code: findings.length ? config.exit.findings : config.exit.ok, findings, output: '' };
  },
};
