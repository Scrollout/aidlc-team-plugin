// Stack packs: each language's layout, scaffold templates, reference domain and the dependency graph the plugin
// reads from source, with no toolchain run (docs/design/stack-packs.md).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { approval, bindingOf, bundleOf, config, domainForms, done, gitLines, globRegex, graphOf, isMap, list, loadProfile, methodOf, msg, nameOf, parseDoc, parseYaml, plug, posix, readPlan, registry, render, sectionOf, seam, shippedDir, tryGit, UsageError, withDefaults } from '../../lib/index.mjs';

const ST = config.state.names; // the lifecycle states, by name

const K = config.packs;
const packsDir = () => shippedDir('packs');

// The pack whose detect file the project has, as { stack, dir, manifest }, or null.
function packFor(root) {
  if (!existsSync(packsDir())) return null;
  for (const stack of readdirSync(packsDir()).sort()) {
    const file = join(packsDir(), stack, K.manifest);
    const manifest = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    if (manifest && list(manifest.detect).some((d) => existsSync(join(root, d)))) return { stack, dir: join(packsDir(), stack), manifest };
  }
  return null;
}
plug('stack', (root) => packFor(root)?.stack ?? null); // for the intake proposal

// The project's source files a pack reads: its extensions, outside the skipped folders, and the tests only when asked.
function sources(root, manifest, tests = false) {
  const out = [], src = new RegExp(manifest.sources), test = new RegExp(K.tests);
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const rel = dir ? `${dir}/${name}` : name;
      if (K.skip.includes(name) || name.startsWith('.')) continue;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (src.test(name) && test.test(name) === tests) out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

// The paths a source file imports, by the pack's patterns: each finds paths in the file, or in the block it names.
const importPaths = (text, patterns) => patterns.flatMap((p) => {
  const scope = p.block ? text.match(new RegExp(p.block, p.flags))?.[1] ?? '' : text;
  return [...scope.matchAll(new RegExp(p.path, `g${p.flags ?? ''}`))].map((m) => m[1]);
});
// How an import path names a folder: inside the module the manifest names, or relative to the importing file.
const RESOLVE = {
  module: (root, manifest) => {
    const mod = readFileSync(join(root, manifest.module.file), 'utf8').match(new RegExp(manifest.module.pattern, 'm'))?.[1];
    return (f, p) => (mod && p.startsWith(`${mod}/`) ? p.slice(mod.length + 1) : null);
  },
  relative: (root) => (f, p) => posix(relative(root, dirname(resolve(root, dirname(f), p)))),
};

// The import edges, folder to folder, as the pack's manifest reads them (docs/design/stack-packs.md#graph).
function importEdges(root, manifest, files) {
  const edges = new Set(), to = RESOLVE[manifest.imports.resolve](root, manifest);
  for (const f of files) {
    for (const dir of importPaths(readFileSync(join(root, f), 'utf8'), manifest.imports.patterns).map((p) => to(f, p)).filter((d) => d !== null)) edges.add(`${dirname(f)}${config.gate.edge}${dir}`);
  }
  return [...edges].map((e) => e.split(config.gate.edge)).filter(([a, b]) => a !== b);
}

// The data edges: a domain's infrastructure to the tables its migrations create, and any code naming another
// domain's table schema-qualified (<domain>.<table>, the grammar's form) to that table.
function dataEdges(root, manifest, profile, files) {
  const prefix = profile.architecture?.data?.prefix ?? K.dataPrefix, out = [];
  const domains = (profile.modules ?? []).filter((m) => m.kind === 'domain').map((m) => String(m.id ?? m.name));
  for (const d of domains) {
    const dir = render(manifest.migrations, { domain: d }), infra = `${render(manifest.folders.domain, { domain: d })}/${manifest.layers.infrastructure}`;
    for (const f of existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((x) => new RegExp(K.migrations.files).test(x)) : []) {
      for (const m of readFileSync(join(root, dir, f), 'utf8').matchAll(new RegExp(K.migrations.createTable, 'gi'))) out.push([infra, `${prefix}${d}/${m[1]}`]);
    }
  }
  if (domains.length) {
    // Only inside string literals, where SQL lives: `notes.save(x)` in code is a call, not a table.
    const qualified = new RegExp(`\\b(${domains.join('|')})\\.(${K.tableName})\\b`, 'g'), literal = new RegExp(manifest.stringLiteral, 'gs');
    for (const f of files) for (const s of readFileSync(join(root, f), 'utf8').matchAll(literal)) for (const m of s[2].matchAll(qualified)) out.push([dirname(f), `${prefix}${m[1]}/${m[2]}`]);
  }
  return out;
}

// The graph `aidlc graph` prints and the architecture checks read: imports, then data.
export function packGraph(root, profile) {
  const pack = packFor(root);
  if (!pack) return null;
  const files = sources(root, pack.manifest);
  const seen = new Set();
  return [...importEdges(root, pack.manifest, files), ...dataEdges(root, pack.manifest, profile, files)].filter(([a, b]) => !seen.has(`${a} ${b}`) && seen.add(`${a} ${b}`));
}

// Event types in a domain's events surface that break the grammar, as [file, message key, data] (decision 0014).
function eventFindings(root, profile) {
  const pack = packFor(root);
  if (!pack?.manifest.eventType || !profile.naming) return [];
  const grammar = new RegExp(config.naming.grammar.event.regex), past = Object.values(config.naming.pastTense), out = [];
  for (const m of (profile.modules ?? []).filter((x) => x.kind === 'domain')) {
    const dir = `${render(pack.manifest.folders.domain, { domain: String(m.id ?? m.name) })}/${pack.manifest.surfaces.events}`;
    for (const f of existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((x) => new RegExp(pack.manifest.sources).test(x)) : []) {
      for (const e of readFileSync(join(root, dir, f), 'utf8').matchAll(new RegExp(pack.manifest.eventType, 'g'))) {
        const type = e[1], last = type.split('.').at(-1);
        if (!grammar.test(type) || new RegExp(K.events.versioned, 'i').test(type) || !(past.some((p) => last.endsWith(p)) || new RegExp(K.events.pastSuffix).test(last))) out.push([`${dir}/${f}`, 'contractEvent', { type }]);
      }
    }
  }
  return out;
}

// The reference slices a card points a builder at, as paths from the project root.
const referenceOf = (root) => { const p = packFor(root); return p ? Object.fromEntries(Object.entries(p.manifest.reference ?? {}).map(([k, v]) => [k, posix(relative(root, join(p.dir, v)))])) : null; };

export const commands = {
  graph(args, { cwd }) {
    const edges = packGraph(cwd, loadProfile(cwd).profile);
    if (!edges) throw new UsageError(msg('packNone', { detect: readdirSync(packsDir()).join(', ') }));
    return done(edges.map((e) => `${e.join(config.gate.edge)}\n`).join(''), config.exit.ok, [], { edges });
  },

  // Writes a kind's templates at its folder with names from the registry; never overwrites (docs/design/stack-packs.md#scaffold).
  scaffold(args, { cwd }) {
    const [kind, name] = args.filter((a) => !a.startsWith('--')), flag = (f) => { const k = args.indexOf(`--${f}`); return k >= 0 ? args[k + 1] : undefined; };
    const pack = packFor(cwd);
    if (!pack) throw new UsageError(msg('packNone', { detect: readdirSync(packsDir()).join(', ') }));
    const { profile } = loadProfile(cwd), reg = registry(profile, bundleOf(cwd, profile));
    if (!pack.manifest.scaffold[kind] || !name) throw new UsageError(msg('scaffoldUsage', { kinds: Object.keys(pack.manifest.scaffold).join(', ') }));
    const domain = kind === 'domain' ? name : flag('domain');
    const v = { domain, stage: name, kit: name, system: name, deployable: name };
    if (domain !== undefined) { const f = domainForms(nameOf('domain', { domain }, reg), reg); Object.assign(v, { domain, singular: f.singularCompact, Singular: f.SingularPascal }); }
    if (kind === 'slice') v.operation = nameOf('slice', { domain, verb: name }, reg);
    const what = K.registered[kind], known = reg.vocabularies[kind]; // registered, never invented
    if (what && !known.includes(name)) throw new UsageError(msg('nameUnregistered', { what, value: name, where: `naming.vocabularies.${kind}`, known: known.join(', ') }));
    if (kind === 'runtime') { // a deployable is <system>-<domain or stage>-<role>, composed, never invented
      const [part, role] = [name.split('-').slice(1, -1).join('-'), name.split('-').at(-1)];
      const composed = nameOf('deployable', { [reg.domains[part] ? 'domain' : 'stage']: part, role }, reg);
      if (composed !== name) throw new UsageError(msg('nameUnregistered', { what: 'deployable', value: name, where: 'naming.grammar.deployable', known: composed }));
    }
    if (kind === 'adapter' && (!new RegExp(config.naming.word).test(name) || reg.banned.includes(name))) throw new UsageError(msg('nameUnregistered', { what: 'system', value: name, where: K.adapterRule, known: '-' }));
    v.dir = render(pack.manifest.folders[kind === 'slice' ? 'domain' : kind], v);
    const out = [];
    for (const [template, to] of pack.manifest.scaffold[kind]) {
      const path = render(to, v), file = join(cwd, path);
      if (existsSync(file)) { out.push(msg('scaffoldKept', { path })); continue; }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, render(readFileSync(join(pack.dir, K.templates, template), 'utf8'), v, template));
      out.push(msg('scaffoldWrote', { path }));
    }
    return done(out.join(''));
  },
};

// A project's own graph must hold every edge the pack reads from source (GRAPH-SELFTEST); none with no pack or no graph.
function selftestFindings(root, profile) {
  const command = profile.architecture?.graph, edges = command && packGraph(root, profile);
  if (!edges || new RegExp(K.selfGraph).test(command)) return [];
  const own = new Set(graphOf(root, command).edges.map(([a, b]) => `${a}${config.gate.edge}${b}`));
  const missing = edges.map(([a, b]) => `${a}${config.gate.edge}${b}`).filter((e) => !own.has(e));
  return missing.length ? [['graphSelftest', { command, count: missing.length, edges: missing.slice(0, K.sample).join('; ') }]] : [];
}

// Event types speak the grammar; a project's graph sees what its pack sees (docs/design/stack-packs.md).
const events = (root, profile) => eventFindings(root, profile).map(([path, key, data]) => ({ code: 'CONTRACT-NAME', path, key, data }));
// Vertical slices across a domain's layers: each slice is a folder of the application layer, met by no other slice,
// entered from its domain's interface layer or a runtime, listed with its use case and stories in the domain doc, and
// tested (docs/design/vertical-slices.md). Returns [{ code, path, key, data }].
const V = config.slices;
export function sliceFindings(root, profile) {
  const pack = packFor(root);
  if (!pack) return [];
  const m = pack.manifest, L = m.layers, out = [], add = (code, path, key, data) => out.push({ code, path, key, data });
  const files = sources(root, m), tests = sources(root, m, true), edges = importEdges(root, m, files), testEdges = importEdges(root, m, tests);
  const entryLayers = V.entryLayers.map((l) => L[l]), hosts = V.entryKinds.map((k) => m.folders[k].split('{{')[0]);
  const placed = [...Object.values(L), ...Object.values(m.surfaces)];
  // Each intent's stories and the modules of their units of work, from the elaboration checks' seam.
  const bundle = bundleOf(root, withDefaults(profile)), plan = readPlan(bundle), held = new Set(), owed = new Map();
  for (const i of plan.intents) {
    const due = approval(i.doc) !== ST.draft && methodOf(i) >= config.method.since.unitsOfWork;
    for (const s of seam('intentStories', profile).flatMap((f) => f(i))) {
      held.add(`${i.id}:${s.story}`);
      if (due) for (const mod of s.modules) owed.set(`${mod} ${i.id}:${s.story}`, i.id);
    }
  }
  const slices = [];
  for (const d of (profile.modules ?? []).filter((x) => x.kind === 'domain').map((x) => String(x.id ?? x.name))) {
    const dir = render(m.folders.domain, { domain: d }), app = `${dir}/${L.application}`;
    if (!existsSync(join(root, dir))) continue;
    const mine = [...files, ...tests].filter((f) => f.startsWith(`${dir}/`));
    for (const f of mine.filter((f) => !placed.includes(f.slice(dir.length + 1).split('/')[0]))) add('SLICE-PLACE', f, 'slicePlace', { file: f, domain: d, layers: placed.join(', ') });
    for (const f of mine.filter((f) => dirname(f) === app)) add('SLICE-PLACE', f, 'sliceLoose', { file: f, application: app });
    const folders = existsSync(join(root, app)) ? readdirSync(join(root, app)).filter((n) => statSync(join(root, app, n)).isDirectory()) : [];
    for (const name of folders) slices.push({ domain: d, name, dir: `${app}/${name}`, root: dir });
    for (const folder of [...folders.map((n) => `${app}/${n}`), ...Object.values(L).map((l) => `${dir}/${l}`).filter((p) => existsSync(join(root, p)))]) if (!files.some((f) => f.startsWith(`${folder}/`))) add('SLICE-PLACE', folder, 'sliceEmpty', { folder });
    const doc = join(bundle, config.okf.bundle.folders.Domain, `${d}${config.okf.ext}`);
    if (!existsSync(doc)) continue;
    const line = new RegExp(`^\\s*[-*]\\s+(?:${V.kinds.join('|')})\\s+(${V.name}):\\s*(.*)$`), rel = posix(relative(root, doc));
    const listed = sectionOf(parseDoc(readFileSync(doc, 'utf8')), V.surface).map(([, t]) => t.match(line)).filter(Boolean);
    for (const name of folders.filter((n) => !listed.some((l) => l[1] === n))) add('SLICE-SURFACE', rel, 'sliceSurface', { domain: d, slice: name, where: msg('sliceSurfaceFolder', {}) });
    for (const [, name, text] of listed) {
      const cited = [...text.matchAll(new RegExp(V.story, 'g'))].map((x) => x[0]), useCase = text.replace(/\[[^\]]*\]/g, '').trim();
      if (!folders.includes(name)) add('SLICE-SURFACE', rel, 'sliceSurface', { domain: d, slice: name, where: msg('sliceSurfaceDoc', {}) });
      if (!useCase) add('SLICE-SURFACE', rel, 'sliceUseCase', { domain: d, slice: name, text });
      if (!cited.length) add('SLICE-STORY', rel, 'sliceNoStory', { domain: d, slice: name });
      for (const story of cited.filter((s) => !held.has(s))) add('SLICE-STORY', rel, 'sliceBadStory', { domain: d, slice: name, story });
    }
    const covered = new Set(listed.flatMap(([, , t]) => [...t.matchAll(new RegExp(V.story, 'g'))].map((x) => x[0])));
    for (const [key, intent] of owed) { const [mod, story] = key.split(' '); if (mod === d && !covered.has(story)) add('SLICE-STORY', rel, 'sliceUncovered', { domain: d, story, intent }); }
  }
  const sliceOf = (p) => slices.find((s) => p === s.dir || p.startsWith(`${s.dir}/`));
  const entry = (from, s) => entryLayers.some((l) => from === `${s.root}/${l}` || from.startsWith(`${s.root}/${l}/`)) || hosts.some((h) => from.startsWith(h));
  for (const [from, to] of edges) {
    const a = sliceOf(from), b = sliceOf(to);
    if (!b || a === b) continue;
    if (a) add('SLICE-IMPORT', from, 'sliceImport', { from: `${a.domain}/${a.name}`, to: `${b.domain}/${b.name}` });
    else if (!entry(from, b)) add('SLICE-ENTRY', from, 'sliceEntry', { from, slice: `${b.domain}/${b.name}`, layers: V.entryLayers.join(', '), kinds: V.entryKinds.join(', ') });
  }
  for (const s of slices) {
    if (!edges.some(([from, to]) => sliceOf(to) === s && entry(from, s))) add('SLICE-ENTRY', s.dir, 'sliceUnreached', { slice: `${s.domain}/${s.name}`, layers: V.entryLayers.join(', '), kinds: V.entryKinds.join(', ') });
    if (!tests.some((t) => t.startsWith(`${s.dir}/`)) && !testEdges.some(([, to]) => sliceOf(to) === s)) add('SLICE-TEST', s.dir, 'sliceTest', { slice: `${s.domain}/${s.name}` });
  }
  if (isMap(profile.naming)) routeFindings(root, profile, slices, add);
  return out;
}
// With a naming registry: each slice a name the registry composes, each operation id of the contracts once and mapped to
// the slice composed from the same domain and verb, and each slice of a domain the contracts serve reached by one.
function routeFindings(root, profile, slices, add) {
  const reg = registry(profile, bundleOf(root, withDefaults(profile))), verbs = reg.vocabularies.verb, compose = (kind, domain, verb) => { try { return nameOf(kind, { domain, verb }, reg); } catch { return null; } };
  const routes = new Map();
  for (const d of [...new Set(slices.map((s) => s.domain))]) for (const verb of verbs) { const id = compose('operation-id', d, verb); if (id) routes.set(id, { domain: d, slice: compose('slice', d, verb) }); }
  for (const s of slices) {
    const names = verbs.map((v) => compose('slice', s.domain, v)).filter(Boolean);
    if (names.length && !names.includes(s.name)) add('SLICE-NAME', s.dir, 'sliceName', { slice: s.name, domain: s.domain, names: names.join(', ') });
  }
  const globs = (profile.naming.contracts ?? config.naming.contract.files).map((g) => globRegex(`/${g}`)), seen = new Map(), served = new Set(), reached = new Set();
  for (const f of gitLines(root, 'ls-files', '--cached', '--others', '--exclude-standard').filter((x) => globs.some((g) => g.test(x)))) {
    let doc;
    try { doc = f.endsWith('.json') ? JSON.parse(readFileSync(join(root, f), 'utf8')) : parseYaml(readFileSync(join(root, f), 'utf8')); } catch { continue; } // CONTRACT-NAME reports it
    for (const item of Object.values(isMap(doc?.paths) ? doc.paths : {})) for (const op of Object.values(isMap(item) ? item : {}).filter((o) => isMap(o) && o.operationId !== undefined)) {
      const id = String(op.operationId), route = routes.get(id);
      if (seen.has(id)) add('SLICE-ROUTE', f, 'sliceRouteTwice', { id });
      seen.set(id, f);
      if (!route) { add('SLICE-ROUTE', f, 'sliceRouteUnknown', { id }); continue; }
      served.add(route.domain);
      const s = slices.find((x) => x.domain === route.domain && x.name === route.slice);
      if (s) reached.add(s);
      else add('SLICE-ROUTE', f, 'sliceRouteNone', { id, slice: route.slice, domain: route.domain });
    }
  }
  for (const s of slices.filter((x) => served.has(x.domain) && !reached.has(x))) add('SLICE-ROUTE', s.dir, 'sliceNoRoute', { slice: `${s.domain}/${s.name}`, domain: s.domain });
}
// The slices a domain doc's # Surface lists, by name, or null when the domain has no doc.
function surfaceOf(bundle, d) {
  const doc = join(bundle, config.okf.bundle.folders.Domain, `${d}${config.okf.ext}`), line = new RegExp(`^\\s*[-*]\\s+(?:${V.kinds.join('|')})\\s+(${V.name}):`);
  return existsSync(doc) ? sectionOf(parseDoc(readFileSync(doc, 'utf8')), V.surface).map(([, t]) => t.match(line)?.[1]).filter(Boolean) : null;
}

// PLAN-SLICE: the slices a bolt lists are on its bound domain's # Surface; a bolt that binds no one domain lists none.
plug('planRules', ({ bundle, units, merged, add, profile }) => {
  for (const u of units.filter((x) => !merged.has(x.id) && x.fm.status !== config.grid.dropped && list(x.fm.slices).length)) {
    const { domains, horizontal } = bindingOf(u, profile);
    if (domains.length !== 1 || horizontal.length) { add('PLAN-SLICE', u, 1, 'planSliceBind', { unit: u.id }); continue; }
    const listed = surfaceOf(bundle, domains[0]) ?? [];
    for (const slice of list(u.fm.slices).filter((s) => !listed.includes(s))) add('PLAN-SLICE', u, 1, 'planSliceSurface', { unit: u.id, slice, domain: domains[0] });
  }
});

// A bolt that adds a slice delivers it whole: its route wired and its surface line written in the same bolt; and each
// slice it lists, its folder changed.
function deliverFindings(tree, profile, paths, unit) {
  const pack = packFor(tree);
  if (!pack) return [];
  const m = pack.manifest, L = m.layers, out = [], hosts = V.entryKinds.map((k) => m.folders[k].split('{{')[0]);
  for (const d of (profile.modules ?? []).filter((x) => x.kind === 'domain').map((x) => String(x.id ?? x.name))) {
    const dir = render(m.folders.domain, { domain: d }), app = `${dir}/${L.application}`, doc = posix(relative(tree, join(bundleOf(tree, withDefaults(profile)), config.okf.bundle.folders.Domain, `${d}${config.okf.ext}`)));
    const added = [...new Set(paths.filter((p) => p.startsWith(`${app}/`) && p.split('/').length > app.split('/').length + 1).map((p) => p.split('/').slice(0, app.split('/').length + 1).join('/')))].filter((s) => tryGit(tree, 'cat-file', '-e', `HEAD:${s}`) === null);
    for (const s of added) {
      const slice = `${d}/${s.split('/').at(-1)}`, layers = V.entryLayers.map((l) => `${dir}/${L[l]}/`);
      if (!paths.some((p) => layers.some((l) => p.startsWith(l)) || hosts.some((h) => p.startsWith(h)))) out.push({ code: 'SLICE-DELIVER', path: s, key: 'sliceDeliverRoute', data: { slice, layers: layers.join(', ') } });
      if (!paths.includes(doc)) out.push({ code: 'SLICE-DELIVER', path: s, key: 'sliceDeliverDoc', data: { slice, doc } });
    }
  }
  const { domains, horizontal } = unit ? bindingOf(unit, profile) : { domains: [], horizontal: [] };
  for (const s of domains.length === 1 && !horizontal.length ? list(unit.fm.slices) : []) {
    const folder = `${render(m.folders.domain, { domain: domains[0] })}/${L.application}/${s}`;
    if (!paths.some((p) => p.startsWith(`${folder}/`))) out.push({ code: 'SLICE-DELIVER', path: folder, key: 'sliceDeliverListed', data: { slice: `${domains[0]}/${s}`, unit: unit.id } });
  }
  return out;
}
// At the gate, a project's existing code is measured as it changes: only findings where the bolt changed a file count.
const touched = (paths) => (f) => paths.some((p) => p === f.path || p.startsWith(`${f.path}/`));
plug('gateChecks', (tree, profile, paths = [], added, unit) => [...sliceFindings(tree, profile).filter(touched(paths)), ...deliverFindings(tree, profile, paths, unit)]);

// VALUE-LITERAL: a string literal a bolt adds to a source file, outside its tests and the project's data, is a value
// that belongs in data; the pack names how its language writes one and what is protocol (docs/design/values.md#in-projects).
export function valueFindings(tree, profile, paths, added = []) {
  const pack = packFor(tree), V = profile.values ?? {}, own = pack?.manifest.values ?? {}, literal = V.literal ?? pack?.manifest.stringLiteral;
  if (!literal) return [];
  const source = new RegExp(pack?.manifest.sources ?? ''), tests = new RegExp(K.tests), data = list(V.data).map((g) => globRegex(`/${g}`));
  const skip = list(own.skipLines).map((x) => new RegExp(x, 'u')), allow = [...list(own.allow), ...list(V.allow)].map((x) => new RegExp(x, 'u')), word = new RegExp(K.valueText, 'u');
  return added.filter(({ file, text }) => source.test(file) && !tests.test(file) && !data.some((g) => g.test(file)) && !skip.some((x) => x.test(text)))
    .flatMap(({ file, line, text }) => [...text.matchAll(new RegExp(literal, 'gs'))].map((m) => m[2]).filter((value) => word.test(value) && !allow.some((x) => x.test(value)))
      .map((value) => ({ code: 'VALUE-LITERAL', path: file, line, key: 'valueLiteral', data: { path: file, line, value } })));
}
plug('gateChecks', valueFindings);

plug('docChecks', (root, profile) => [...events(root, profile), ...selftestFindings(root, profile).map(([key, data]) => ({ code: 'GRAPH-SELFTEST', key, data }))]);
plug('gateChecks', events);
plug('proofPatterns', (root) => packFor(root)?.manifest.compileError);
// The card of a bolt that names a domain links the reference slices to copy.
plug('cardSections', (top, bolt, profile) => {
  const ref = referenceOf(top), named = (profile.modules ?? []).some((m) => m.kind === 'domain' && bolt.modules.includes(String(m.id ?? m.name)));
  return ref && named ? [msg('cardReference', ref)] : [];
});
