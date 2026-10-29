// What a bolt's slices give its card and its board item, read through the stack pack the stacks extension finds
// (docs/design/slice-method.md#built).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindingOf, bundleOf, config, gitLines, globRegex, idOf, incrementLines, list, methodOf, msg, nameOf, plug, readPlan, registry, relPath, render, seam, unitPaths, withDefaults } from '../../lib/index.mjs';

const under = (p, at) => p === at || p.startsWith(`${at}/`);

// The stack pack the stacks extension finds, through its seam; null when the pack maps no slice paths.
function packOf(root, profile) {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(root)?.manifest;
  return m?.slicePaths ? { stacks, m, paths: m.slicePaths } : null;
}

// What every view of a project's slices reads: the pack, the docs bundle, the domains, each declared slice with its
// domain doc, and the domain that publishes each integration event; null with no pack.
function context(root, profile) {
  const pack = packOf(root, profile);
  if (!pack) return null;
  const { stacks } = pack, bundle = bundleOf(root, withDefaults(profile)), mods = profile.modules ?? [], domains = mods.filter((x) => x.kind === 'domain').map(idOf);
  const publishers = new Map();
  for (const [d, events] of stacks.events(bundle, domains)) for (const e of events) if (!publishers.has(stacks.event(e))) publishers.set(stacks.event(e), d);
  const docOf = (domain) => relPath(root, join(bundle, config.okf.bundle.folders.Domain, `${domain}${config.okf.ext}`));
  const slices = domains.flatMap((domain) => (stacks.listed(bundle, domain) ?? []).map((slice) => ({ domain, slice, name: `${domain}/${slice}`, doc: docOf(domain), decl: stacks.declared(root, profile, domain, slice) })))
    .filter((x) => x.decl?.cuts.length);
  return { ...pack, bundle, mods, domains, slices, publisher: (e) => publishers.get(stacks.event(e)) };
}

// The slices a bolt lists in its one domain, each with its declaration and its cuts as paths, the pack's slicePaths read
// from the bottom, the shared layers before the slice's own code; null for a bolt that lists none or binds no one domain.
function slicesOf(top, bolt, profile) {
  if (!list(bolt.fm?.slices).length) return null;
  const pack = packOf(top, profile), { domains, horizontal } = bindingOf(bolt, profile);
  if (!pack || domains.length !== 1 || horizontal.length) return null;
  const { stacks, m } = pack, [domain] = domains, order = Object.keys(pack.paths).reverse();
  return { domain, slices: list(bolt.fm.slices).map((slice) => {
    const decl = stacks.declared(top, profile, domain, slice) ?? { cuts: [] };
    return { slice, decl, cuts: order.filter((cut) => decl.cuts.includes(cut)).map((cut) => ({ cut, path: stacks.path(m, domain, slice, cut) })) };
  }) };
}

// The card of a bolt that lists slices: each slice's scaffold command, then each cut it declares as a step, test first.
plug('cardSlices', (top, bolt, profile) => {
  const of = slicesOf(top, bolt, profile);
  if (!of) return [];
  const { domain } = of, reg = profile.naming && registry(profile, bundleOf(top, withDefaults(profile)));
  // scaffold takes the verb the registry composes the slice's name from
  const verbOf = (slice) => (reg?.vocabularies.verb ?? []).find((verb) => { try { return nameOf('slice', { domain, verb }, reg) === slice; } catch { return false; } });
  const slices = of.slices.filter((s) => s.cuts.length).map(({ slice, cuts }) => {
    const verb = verbOf(slice), scaffold = verb ? msg('cardSliceScaffold', { verb, domain }) : '';
    return msg('cardSlice', { slice, scaffold, steps: cuts.map(({ cut, path }, k) => msg('cardSliceStep', { n: k + 1, cut, path })).join('') });
  }).join('');
  return slices ? [msg('cardSlices', { slices })] : [];
});

// A bolt's board item: each slice with its cuts, data and entry, and how many cuts are done: each one its branch changed
// since the base, every one once merged (docs/design/board.md#shape).
plug('boardSlices', (top, bolt, profile, { base, merged }) => {
  const of = slicesOf(top, bolt, profile);
  if (!of?.slices.length) return null;
  const branch = merged ? [] : unitPaths(top, base, bolt.id), changed = ({ path }) => merged || branch.some((p) => under(p, path));
  const done = of.slices.map((s) => s.cuts.filter(changed).length);
  const lines = of.slices.map(({ slice, decl, cuts }, k) => msg('boardSlice', { slice, cuts: cuts.map((c) => c.cut).join(', ') || '-', data: list(decl.data).join(', ') || '-', entry: decl.entry || '-', done: done[k], total: cuts.length }));
  return { lines, done: done.reduce((a, b) => a + b, 0) };
});

// What the pack's graph shows of each declared slice (docs/design/slice-method.md#proved): SLICE-DATA, a data edge from
// its own code's folders to a node it does not declare; SLICE-INTEGRATE, an import of another domain's client, an
// adapter, an extension or a domain's events it does not declare, or a declared call or event it does not import;
// SLICE-ROUTE, its entry not importing its domain's interface layer, or a runtime no slice of the domain names importing
// it; SLICE-GOVERN, no permission behind an entry applying a pipeline stage of the chosen model, or its own code importing
// a pipeline module (docs/design/slice-declares.md#governance). Returns [{ code, path, key, data }].
export function graphFindings(root, profile, c = context(root, profile)) {
  if (!c) return [];
  const { stacks, m, mods, domains } = c, D = config.slices.declaration, edges = stacks.graph(root, profile) ?? [], out = [];
  const prefix = profile.architecture?.data?.prefix ?? config.packs.dataPrefix, inside = (at) => (p) => under(p, at);
  // A slice's own code in folders: the graph's edges run between folders, so a file of a shared folder tells no slice.
  const ownFolders = Object.entries(c.paths).filter(([, p]) => p.includes('{{slice}}') && !new RegExp(m.sources).test(p)).map(([cut]) => cut);
  const globsOf = new Map(mods.map((x) => [idOf(x), list(x.paths).map((g) => globRegex(g))])), inModule = (name) => (p) => (globsOf.get(name) ?? []).some((g) => g.test(`${p}/`));
  const dirOf = (d) => render(m.folders.domain, { domain: d }), client = (d) => inside(`${dirOf(d)}/${m.surfaces.client}`), events = (d) => (d ? inside(`${dirOf(d)}/${m.surfaces.events}`) : () => false);
  // A call reaches a domain's client or another module's paths; an event its publisher's events folder.
  const callee = (name) => (domains.includes(name) ? client(name) : inModule(name));
  const others = mods.filter((x) => x.kind !== 'domain' && D.callKinds.includes(x.kind)).map((x) => inModule(idOf(x))), pipelines = mods.filter((x) => x.kind === D.pipeline).map((x) => inModule(idOf(x)));
  // The pipeline stages a runtime applies to every slice it serves, from the chosen model.
  const layers = seam('modelLayers', profile).map((f) => f(root, profile)).find(Array.isArray) ?? [];
  const stagesOf = (entry) => { const l = layers.find((x) => x.id === (mods.find((y) => idOf(y) === entry)?.layer ?? entry)); return list(l?.applies).filter((a) => layers.some((x) => x.id === a && x.kind === D.pipeline)); };
  // Each runtime's edges, found once.
  const runtimes = mods.filter((x) => x.kind === D.runtime).map((rt) => ({ id: idOf(rt), edges: edges.filter(([f]) => inModule(idOf(rt))(f)) }));
  for (const domain of domains) {
    const iface = `${dirOf(domain)}/${m.layers.interface}`, surfaces = [...domains.filter((d) => d !== domain).map(client), ...domains.map(events), ...others];
    const slices = c.slices.filter((s) => s.domain === domain);
    for (const { slice, name, doc, decl } of slices) {
      const at = { slice: name }, folders = ownFolders.filter((cut) => decl.cuts.includes(cut)).map((cut) => stacks.path(m, domain, slice, cut));
      const reached = edges.filter(([f]) => folders.some((x) => under(f, x))), data = list(decl.data).map((g) => globRegex(g));
      for (const [from, to] of reached.filter(([, t]) => t.startsWith(prefix) && !data.some((g) => g.test(t)))) out.push({ code: 'SLICE-DATA', path: from, key: 'sliceDataEdge', data: { ...at, node: to } });
      const wanted = [...list(decl.calls).map((t) => [t, callee(t)]), ...(list(decl.emits).length ? [[list(decl.emits).join(', '), events(domain)]] : []), ...list(decl.consumes).map((e) => [e, events(c.publisher(e))])];
      for (const [target] of wanted.filter(([, reaches]) => !reached.some(([, t]) => reaches(t)))) out.push({ code: 'SLICE-INTEGRATE', path: folders[0] ?? iface, key: 'sliceIntegrateUnreached', data: { ...at, name: target } });
      for (const [from, to] of reached.filter(([, t]) => surfaces.some((s) => s(t)) && !wanted.some(([, reaches]) => reaches(t)))) out.push({ code: 'SLICE-INTEGRATE', path: from, key: 'sliceIntegrateUndeclared', data: { ...at, to } });
      const stages = stagesOf(decl.entry);
      if (stages.length && !decl.permission) out.push({ code: 'SLICE-GOVERN', path: doc, key: 'sliceGovernPermission', data: { ...at, entry: decl.entry, stages: stages.join(', ') } });
      for (const [from, to] of reached.filter(([, t]) => pipelines.some((p) => p(t)))) out.push({ code: 'SLICE-GOVERN', path: from, key: 'sliceGovernSelf', data: { ...at, to } });
    }
    const entries = new Set(slices.map((s) => s.decl.entry).filter(Boolean));
    for (const rt of runtimes) {
      const wires = rt.edges.filter(([, t]) => under(t, iface));
      if (entries.has(rt.id) && !wires.length) out.push({ code: 'SLICE-ROUTE', path: iface, key: 'sliceEntryUnwired', data: { runtime: rt.id, domain, layer: iface, slices: slices.filter((s) => s.decl.entry === rt.id).map((s) => s.slice).join(', ') } });
      if (entries.size && !entries.has(rt.id)) for (const [from] of wires) out.push({ code: 'SLICE-ROUTE', path: from, key: 'sliceEntryOther', data: { runtime: rt.id, domain, entries: [...entries].join(', ') } });
    }
  }
  return out;
}

// SLICE-TEST, once a level's `proves` holds route or handoff: a test at a route level names each declared slice and its
// permission; one at a handoff level names each event and call it declares, a consumer's the publisher too, an async
// slice's a terminal state (docs/design/slice-method.md#proved). Returns [{ code, path, key, data }].
export function testFindings(root, profile, c = context(root, profile)) {
  const P = config.slices.proves, levels = Object.values(withDefaults(profile).levels ?? {});
  const globs = (what) => levels.filter((l) => list(l?.proves).includes(what)).flatMap((l) => list(l.paths)).map((g) => globRegex(g));
  const [route, handoff] = [globs(P.route), globs(P.handoff)];
  if (!c || (!route.length && !handoff.length)) return [];
  const files = gitLines(root, 'ls-files', '--cached', '--others', '--exclude-standard'), read = new Map(), out = [];
  const texts = (g) => files.filter((f) => g.some((x) => x.test(f))).map((f) => (read.has(f) ? read.get(f) : read.set(f, readFileSync(join(root, f), 'utf8')).get(f)));
  const [routeTests, handoffTests] = [texts(route), texts(handoff)], names = (tests, ...words) => tests.some((t) => words.every((w) => t.includes(w)));
  const terminal = (t) => config.slices.terminal.some((x) => t.toLowerCase().includes(x.toLowerCase())), base = c.stacks.event, app = c.m.layers.application;
  for (const { domain, slice, name, doc, decl } of c.slices) {
    const path = decl.cuts.includes(app) ? c.stacks.path(c.m, domain, slice, app) : doc;
    const add = (key, data = {}) => out.push({ code: 'SLICE-TEST', path, key, data: { slice: name, ...data } });
    if (route.length && !names(routeTests, slice)) add('sliceTestRoute', { level: P.route });
    else if (route.length && decl.permission && !names(routeTests, slice, decl.permission)) add('sliceTestPermission', { permission: decl.permission });
    if (!handoff.length) continue;
    for (const n of [...list(decl.emits), ...list(decl.consumes), ...list(decl.calls)].filter((x) => !names(handoffTests, base(x)))) add('sliceTestHandoff', { name: n, level: P.handoff });
    for (const e of list(decl.consumes).filter((x) => c.publisher(x) && names(handoffTests, base(x)) && !names(handoffTests, base(x), c.publisher(x)))) add('sliceTestPublisher', { event: e, publisher: c.publisher(e) });
    if (decl.async && !handoffTests.some((t) => t.includes(slice) && terminal(t))) add('sliceTestAsync', { states: config.slices.terminal.join(', ') });
  }
  return out;
}

// INCR-SKELETON, from method 13: increment 1's first bolt listing a slice has its first slice cut every layer the pack
// has, any form of a layer with forms counting for it (docs/design/construction.md).
plug('planRules', ({ profile, live = [], all = [], add, base }) => {
  const pack = packOf(base, profile);
  if (!pack) return;
  const layerOf = pack.stacks.layer, layers = [...new Set(Object.keys(pack.paths).map(layerOf))];
  for (const i of live.filter((x) => methodOf(x) >= config.method.since.sliceCuts)) {
    const own = all.filter((u) => u.fm.intent === i.id), [line] = incrementLines(i);
    const first = (line ? line.ids.map((x) => own.find((u) => u.id === x)).filter(Boolean) : own).find((u) => list(u.fm.slices).length), domains = first ? bindingOf(first, profile).domains : [];
    if (domains.length !== 1) continue;
    const slice = list(first.fm.slices)[0], cuts = pack.stacks.declared(base, profile, domains[0], slice)?.cuts ?? [];
    const missing = layers.filter((l) => !cuts.some((cut) => layerOf(cut) === l));
    if (missing.length) add('INCR-SKELETON', i, 1, 'incrSkeletonSlice', { slice, bolt: first.id, missing: missing.join(', ') });
  }
});

// Each declared slice of each domain, layer by layer: planned while none of its own code is written, done once every cut
// is, partial between; with its permission, entry and hand-offs to the slices and domains it reaches
// (docs/design/slice-method.md#reported).
function sliceReport(root, profile) {
  const c = context(root, profile), S = config.slices.states;
  if (!c) return [];
  const own = (cut) => c.paths[cut].includes('{{slice}}'), call = msg('sliceReportCall', {});
  // The slices consuming each integration event, found once.
  const consumers = new Map();
  for (const s of c.slices) for (const e of list(s.decl.consumes)) consumers.set(c.stacks.event(e), new Set([...(consumers.get(c.stacks.event(e)) ?? []), s.name]));
  return c.slices.map((r) => {
    const cuts = r.decl.cuts.map((cut) => ({ cut, done: existsSync(join(root, c.stacks.path(c.m, r.domain, r.slice, cut))) })), written = cuts.filter((x) => x.done && own(x.cut));
    const handoffs = [...list(r.decl.emits).flatMap((e) => [...(consumers.get(c.stacks.event(e)) ?? [])].map((to) => ({ to, via: e }))), ...list(r.decl.calls).map((to) => ({ to, via: call }))];
    return { ...r, cuts, handoffs, state: !written.length ? S.planned : cuts.every((x) => x.done) ? S.done : S.partial };
  });
}
const reportLines = (rows) => rows.map((r) => msg('sliceReportLine', { slice: r.name, state: r.state, done: r.cuts.filter((c) => c.done).map((c) => c.cut).join(', ') || '-', todo: r.cuts.filter((c) => !c.done).map((c) => c.cut).join(', ') || '-',
  handoffs: r.handoffs.map((h) => msg('sliceReportHandoff', h)).join('') })).join('');
// Status counts the slices in each state; the map's page holds the table, layer by layer.
plug('statusLines', (st) => {
  const rows = sliceReport(st.cwd, st.profile);
  return rows.length ? msg('sliceCounts', Object.fromEntries(Object.entries(config.slices.states).map(([k, s]) => [k, rows.filter((r) => r.state === s).length]))) : '';
});
plug('mapPages', (root, profile, base) => {
  const rows = sliceReport(root, profile), P = config.slices.mapPage;
  return rows.length ? [{ ...P, file: `${base}${P.suffix}${config.okf.ext}`, body: msg('sliceReportHead', { lines: reportLines(rows) }) }] : [];
});
// The trace of an intent: the permission catalogue of the slices its bolts list.
plug('traceSections', (root, profile, intent) => {
  const listed = new Set(readPlan(bundleOf(root, withDefaults(profile))).units.filter((u) => u.fm.intent === intent.id).flatMap((u) => list(u.fm.slices)));
  const rows = listed.size ? sliceReport(root, profile).filter((r) => listed.has(r.slice)) : [];
  return rows.length ? msg('slicePermissions', { rows: rows.map((r) => msg('slicePermissionRow', { slice: r.name, permission: r.decl.permission || '-', entry: r.decl.entry || '-' })).join('') }) : '';
});
// The layer a path sits in: a layer of its domain, from the stack pack, else its module's kind; for the retro. Each
// profile's module globs compile once.
const moduleGlobs = new WeakMap();
plug('layerOf', (root, profile, path) => {
  if (!moduleGlobs.has(profile)) moduleGlobs.set(profile, (profile.modules ?? []).map((x) => ({ mod: x, globs: list(x.paths).map((g) => globRegex(g)) })));
  const mod = moduleGlobs.get(profile).find((x) => x.globs.some((g) => g.test(path) || g.test(`${path}/`)))?.mod;
  if (!mod) return null;
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(root)?.manifest, dir = m && mod.kind === 'domain' ? render(m.folders.domain, { domain: idOf(mod) }) : null;
  return (dir && Object.keys(m.layers).find((l) => under(path, `${dir}/${m.layers[l]}`))) || mod.kind || null;
});

// The slice checks over the whole tree, for check --tree; at the gate, as the stacks' slice checks, only findings
// where the bolt changed a file count.
const whole = (tree, profile, c = context(tree, profile)) => (c ? [...graphFindings(tree, profile, c), ...testFindings(tree, profile, c)] : []);
plug('treeChecks', whole);
plug('gateChecks', (tree, profile, paths = []) => { const c = context(tree, profile); return c ? whole(tree, profile, c).filter(c.stacks.touched(paths)) : []; });
