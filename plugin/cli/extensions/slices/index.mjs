// What a bolt's slices give its card and its board item, read through the stack pack the stacks extension finds
// (docs/design/slice-method.md#built).
import { join } from 'node:path';
import { bindingOf, branchOf, bundleOf, config, gitLines, globRegex, list, msg, nameOf, plug, registry, relPath, render, seam, tryGit, withDefaults } from '../../lib/index.mjs';

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
// At the gate, as the stacks' slice checks: only findings where the bolt changed a file count.
plug('gateChecks', (tree, profile, paths = []) => graphFindings(tree, profile).filter((f) => paths.some((p) => p === f.path || p.startsWith(`${f.path}/`))));
