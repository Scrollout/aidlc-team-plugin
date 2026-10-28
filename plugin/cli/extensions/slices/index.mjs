// What a bolt's slices give its card and its board item, read through the stack pack the stacks extension finds
// (docs/design/slice-method.md#built).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindingOf, branchOf, bundleOf, config, gitLines, globRegex, incrementLines, list, methodOf, msg, nameOf, plug, readPlan, registry, relPath, render, seam, tryGit, withDefaults } from '../../lib/index.mjs';

// The slices a bolt lists in its one domain, each with its declaration and its cuts as paths, the pack's slicePaths read
// from the bottom, the shared layers before the slice's own code; null for a bolt that binds no one domain.
function slicesOf(top, bolt, profile) {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(top)?.manifest, { domains, horizontal } = bindingOf(bolt, profile);
  if (!m?.slicePaths || domains.length !== 1 || horizontal.length) return null;
  const [domain] = domains, order = Object.keys(stacks.paths(m)).reverse();
  return { domain, slices: list(bolt.fm?.slices).map((slice) => {
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
  const branch = !merged && tryGit(top, 'rev-parse', '-q', '--verify', branchOf(bolt.id)) ? gitLines(top, 'diff', '--name-only', `${base}...${branchOf(bolt.id)}`) : [];
  const changed = ({ path }) => merged || branch.some((p) => p === path || p.startsWith(`${path}/`));
  const lines = of.slices.map(({ slice, decl, cuts }) => msg('boardSlice', { slice, cuts: cuts.map((c) => c.cut).join(', ') || '-', data: list(decl.data).join(', ') || '-', entry: decl.entry || '-', done: cuts.filter(changed).length, total: cuts.length }));
  return { lines, done: of.slices.reduce((n, s) => n + s.cuts.filter(changed).length, 0) };
});

// What the pack's graph shows of each declared slice (docs/design/slice-method.md#proved): SLICE-DATA, a data edge from
// its own code's folders to a node it does not declare; SLICE-INTEGRATE, an import of another domain's client, an
// adapter, an extension or a domain's events it does not declare, or a declared call or event it does not import;
// SLICE-ROUTE, its entry not importing its domain's interface layer, or a runtime no slice of the domain names importing
// it; SLICE-GOVERN, no permission behind an entry applying a pipeline stage of the chosen model, or its own code importing
// a pipeline module (docs/design/slice-declares.md#governance). Returns [{ code, path, key, data }].
export function graphFindings(root, profile) {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(root)?.manifest;
  if (!m?.slicePaths) return [];
  const D = config.slices.declaration, edges = stacks.graph(root, profile) ?? [], bundle = bundleOf(root, withDefaults(profile)), out = [], mods = profile.modules ?? [];
  const prefix = profile.architecture?.data?.prefix ?? config.packs.dataPrefix, under = (p, at) => p === at || p.startsWith(`${at}/`), inside = (at) => (p) => under(p, at);
  const own = Object.entries(stacks.paths(m)).filter(([, p]) => p.includes('{{slice}}') && !new RegExp(m.sources).test(p)).map(([cut]) => cut);
  const id = (x) => String(x.id ?? x.name), runtimes = mods.filter((x) => x.kind === D.runtime), domains = mods.filter((x) => x.kind === 'domain').map(id);
  const inModule = (name) => (p) => list(mods.find((x) => id(x) === name)?.paths).some((g) => globRegex(g).test(`${p}/`));
  const dirOf = (d) => render(m.folders.domain, { domain: d }), client = (d) => inside(`${dirOf(d)}/${m.surfaces.client}`), events = (d) => (d ? inside(`${dirOf(d)}/${m.surfaces.events}`) : () => false);
  // A call reaches a domain's client or another module's paths; an event its publisher's events folder.
  const callee = (name) => (domains.includes(name) ? client(name) : inModule(name));
  const base = (e) => e.replace(new RegExp(config.packs.events.versioned), ''), published = stacks.events(bundle, domains);
  const publisher = (e) => domains.find((d) => (published.get(d) ?? []).map(base).includes(base(e)));
  const others = mods.filter((x) => x.kind !== 'domain' && D.callKinds.includes(x.kind)).map((x) => inModule(id(x)));
  // The pipeline stages a runtime applies to every slice it serves, from the chosen model; the pipeline modules.
  const layers = seam('modelLayers', profile).map((f) => f(root, profile)).find(Array.isArray) ?? [], pipelines = mods.filter((x) => x.kind === D.pipeline);
  const stagesOf = (entry) => { const l = layers.find((x) => x.id === (mods.find((y) => id(y) === entry)?.layer ?? entry)); return list(l?.applies).filter((a) => layers.some((x) => x.id === a && x.kind === D.pipeline)); };
  for (const domain of domains) {
    const iface = `${dirOf(domain)}/${m.layers.interface}`, surfaces = [...domains.filter((d) => d !== domain).map(client), ...domains.map(events), ...others];
    const doc = relPath(root, join(bundle, config.okf.bundle.folders.Domain, `${domain}${config.okf.ext}`));
    const slices = (stacks.listed(bundle, domain) ?? []).map((slice) => ({ slice, decl: stacks.declared(root, profile, domain, slice) })).filter((s) => s.decl?.cuts.length);
    for (const { slice, decl } of slices) {
      const at = { slice: `${domain}/${slice}` }, folders = own.filter((cut) => decl.cuts.includes(cut)).map((cut) => stacks.path(m, domain, slice, cut));
      const reached = edges.filter(([f]) => folders.some((x) => under(f, x)));
      for (const [from, to] of reached.filter(([, t]) => t.startsWith(prefix) && !list(decl.data).some((g) => globRegex(g).test(t)))) out.push({ code: 'SLICE-DATA', path: from, key: 'sliceDataEdge', data: { ...at, node: to } });
      const wanted = [...list(decl.calls).map((t) => [t, callee(t)]), ...(list(decl.emits).length ? [[list(decl.emits).join(', '), events(domain)]] : []), ...list(decl.consumes).map((e) => [e, events(publisher(e))])];
      for (const [name] of wanted.filter(([, target]) => !reached.some(([, t]) => target(t)))) out.push({ code: 'SLICE-INTEGRATE', path: folders[0] ?? iface, key: 'sliceIntegrateUnreached', data: { ...at, name } });
      for (const [from, to] of reached.filter(([, t]) => surfaces.some((s) => s(t)) && !wanted.some(([, target]) => target(t)))) out.push({ code: 'SLICE-INTEGRATE', path: from, key: 'sliceIntegrateUndeclared', data: { ...at, to } });
      const stages = stagesOf(decl.entry);
      if (stages.length && !decl.permission) out.push({ code: 'SLICE-GOVERN', path: doc, key: 'sliceGovernPermission', data: { ...at, entry: decl.entry, stages: stages.join(', ') } });
      for (const [from, to] of reached.filter(([, t]) => pipelines.some((x) => inModule(id(x))(t)))) out.push({ code: 'SLICE-GOVERN', path: from, key: 'sliceGovernSelf', data: { ...at, to } });
    }
    const entries = new Set(slices.map((s) => s.decl.entry).filter(Boolean)), wires = (rt) => edges.filter(([f, t]) => inModule(id(rt))(f) && under(t, iface));
    for (const rt of runtimes) {
      if (entries.has(id(rt)) && !wires(rt).length) out.push({ code: 'SLICE-ROUTE', path: iface, key: 'sliceEntryUnwired', data: { runtime: id(rt), domain, layer: iface, slices: slices.filter((s) => s.decl.entry === id(rt)).map((s) => s.slice).join(', ') } });
      if (entries.size && !entries.has(id(rt))) for (const [from] of wires(rt)) out.push({ code: 'SLICE-ROUTE', path: from, key: 'sliceEntryOther', data: { runtime: id(rt), domain, entries: [...entries].join(', ') } });
    }
  }
  return out;
}

// SLICE-TEST, once a level's `proves` holds route or handoff: a test at a route level names each declared slice and its
// permission; one at a handoff level names each event and call it declares, a consumer's the publisher too, an async
// slice's a terminal state (docs/design/slice-method.md#proved). Returns [{ code, path, key, data }].
export function testFindings(root, profile) {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(root)?.manifest, P = config.slices.proves;
  const globs = (what) => Object.values(withDefaults(profile).levels ?? {}).filter((l) => list(l?.proves).includes(what)).flatMap((l) => list(l.paths));
  const [route, handoff] = [globs(P.route), globs(P.handoff)];
  if (!m?.slicePaths || (!route.length && !handoff.length)) return [];
  const files = gitLines(root, 'ls-files', '--cached', '--others', '--exclude-standard'), bundle = bundleOf(root, withDefaults(profile)), out = [];
  const texts = (g) => files.filter((f) => g.some((x) => globRegex(x).test(f))).map((f) => readFileSync(join(root, f), 'utf8'));
  const [routeTests, handoffTests] = [texts(route), texts(handoff)], names = (tests, ...words) => tests.some((t) => words.every((w) => t.includes(w)));
  const id = (x) => String(x.id ?? x.name), domains = (profile.modules ?? []).filter((x) => x.kind === 'domain').map(id);
  const base = (e) => e.replace(new RegExp(config.packs.events.versioned), ''), published = stacks.events(bundle, domains);
  const publisher = (e) => domains.find((d) => (published.get(d) ?? []).map(base).includes(base(e)));
  const terminal = (t) => config.slices.terminal.some((x) => t.toLowerCase().includes(x.toLowerCase()));
  for (const domain of domains) {
    const doc = relPath(root, join(bundle, config.okf.bundle.folders.Domain, `${domain}${config.okf.ext}`));
    for (const { slice, decl } of (stacks.listed(bundle, domain) ?? []).map((x) => ({ slice: x, decl: stacks.declared(root, profile, domain, x) })).filter((x) => x.decl?.cuts.length)) {
      const at = { slice: `${domain}/${slice}` }, path = decl.cuts.includes(m.layers.application) ? stacks.path(m, domain, slice, m.layers.application) : doc, add = (key, data = {}) => out.push({ code: 'SLICE-TEST', path, key, data: { ...at, ...data } });
      if (route.length && !names(routeTests, slice)) add('sliceTestRoute', { level: P.route });
      else if (route.length && decl.permission && !names(routeTests, slice, decl.permission)) add('sliceTestPermission', { permission: decl.permission });
      if (!handoff.length) continue;
      for (const name of [...list(decl.emits), ...list(decl.consumes), ...list(decl.calls)].filter((n) => !names(handoffTests, base(n)))) add('sliceTestHandoff', { name, level: P.handoff });
      for (const e of list(decl.consumes).filter((x) => publisher(x) && names(handoffTests, base(x)) && !names(handoffTests, base(x), publisher(x)))) add('sliceTestPublisher', { event: e, publisher: publisher(e) });
      if (decl.async && !handoffTests.some((t) => t.includes(slice) && terminal(t))) add('sliceTestAsync', { states: config.slices.terminal.join(', ') });
    }
  }
  return out;
}

// INCR-SKELETON, from method 13: increment 1's first bolt listing a slice has its first slice cut every layer the pack
// has, any form of a layer with forms counting for it (docs/design/construction.md).
plug('planRules', ({ profile, live = [], all = [], add, base }) => {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(base)?.manifest, D = config.slices.declaration;
  if (!m?.slicePaths) return;
  const layers = [...new Set(Object.keys(stacks.paths(m)).map((c) => c.split(D.form)[0]))];
  for (const i of live.filter((x) => methodOf(x) >= config.method.since.sliceCuts)) {
    const own = all.filter((u) => u.fm.intent === i.id), [line] = incrementLines(i);
    const first = (line ? line.ids.map((x) => own.find((u) => u.id === x)).filter(Boolean) : own).find((u) => list(u.fm.slices).length), domains = first ? bindingOf(first, profile).domains : [];
    if (domains.length !== 1) continue;
    const slice = list(first.fm.slices)[0], cuts = stacks.declared(base, profile, domains[0], slice)?.cuts ?? [];
    const missing = layers.filter((l) => !cuts.some((c) => c.split(D.form)[0] === l));
    if (missing.length) add('INCR-SKELETON', i, 1, 'incrSkeletonSlice', { slice, bolt: first.id, missing: missing.join(', ') });
  }
});

// Each declared slice of each domain, layer by layer: planned while none of its own code is written, done once every cut
// is, partial between; with its permission, entry and hand-offs to the slices and domains it reaches
// (docs/design/slice-method.md#reported).
function sliceReport(root, profile) {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(root)?.manifest, S = config.slices.states;
  if (!m?.slicePaths) return [];
  const bundle = bundleOf(root, withDefaults(profile)), id = (x) => String(x.id ?? x.name), domains = (profile.modules ?? []).filter((x) => x.kind === 'domain').map(id);
  const base = (e) => e.replace(new RegExp(config.packs.events.versioned), ''), own = (cut) => stacks.paths(m)[cut].includes('{{slice}}');
  const rows = domains.flatMap((domain) => (stacks.listed(bundle, domain) ?? []).map((slice) => ({ domain, slice, name: `${domain}/${slice}`, decl: stacks.declared(root, profile, domain, slice) })).filter((r) => r.decl?.cuts.length));
  return rows.map((r) => {
    const cuts = r.decl.cuts.map((cut) => ({ cut, done: existsSync(join(root, stacks.path(m, r.domain, r.slice, cut))) })), written = cuts.filter((c) => c.done && own(c.cut));
    const consumers = (e) => rows.filter((x) => list(x.decl.consumes).map(base).includes(base(e))).map((x) => x.name);
    const handoffs = [...list(r.decl.emits).flatMap((e) => consumers(e).map((to) => ({ to, via: e }))), ...list(r.decl.calls).map((to) => ({ to, via: msg('sliceReportCall', {}) }))];
    return { ...r, cuts, handoffs, state: !written.length ? S.planned : cuts.every((c) => c.done) ? S.done : S.partial };
  });
}
const reportLines = (rows) => rows.map((r) => msg('sliceReportLine', { slice: r.name, state: r.state, done: r.cuts.filter((c) => c.done).map((c) => c.cut).join(', ') || '-', todo: r.cuts.filter((c) => !c.done).map((c) => c.cut).join(', ') || '-',
  handoffs: r.handoffs.map((h) => msg('sliceReportHandoff', h)).join('') })).join('');
plug('statusLines', (st) => { const rows = sliceReport(st.cwd, st.profile); return rows.length ? msg('sliceReportHead', { lines: reportLines(rows) }) : ''; });
plug('mapPages', (root, profile, base) => { const rows = sliceReport(root, profile), P = config.slices.mapPage; return rows.length ? [{ ...P, file: `${base}${P.suffix}${config.okf.ext}`, body: msg('sliceReportHead', { lines: reportLines(rows) }) }] : []; });
// The trace of an intent: the permission catalogue of the slices its bolts list.
plug('traceSections', (root, profile, intent) => {
  const listed = new Set(readPlan(bundleOf(root, withDefaults(profile))).units.filter((u) => u.fm.intent === intent.id).flatMap((u) => list(u.fm.slices)));
  const rows = sliceReport(root, profile).filter((r) => listed.has(r.slice));
  return rows.length ? msg('slicePermissions', { rows: rows.map((r) => msg('slicePermissionRow', { slice: r.name, permission: r.decl.permission || '-', entry: r.decl.entry || '-' })).join('') }) : '';
});
// The layer a path sits in: a layer of its domain, from the stack pack, else its module's kind; for the retro.
plug('layerOf', (root, profile, path) => {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(root)?.manifest, mods = profile.modules ?? [];
  const mod = mods.find((x) => list(x.paths).some((g) => globRegex(g).test(path) || globRegex(g).test(`${path}/`)));
  if (!mod) return null;
  const dir = m && mod.kind === 'domain' ? render(m.folders.domain, { domain: String(mod.id ?? mod.name) }) : null;
  return (dir && Object.keys(m.layers).find((l) => path.startsWith(`${dir}/${m.layers[l]}`))) || mod.kind || null;
});

// At the gate, as the stacks' slice checks: only findings where the bolt changed a file count.
plug('gateChecks', (tree, profile, paths = []) => [...graphFindings(tree, profile), ...testFindings(tree, profile)].filter((f) => paths.some((p) => p === f.path || p.startsWith(`${f.path}/`))));
