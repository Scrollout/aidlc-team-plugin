// What a bolt's slices give its card and its board item, read through the stack pack the stacks extension finds
// (docs/design/slice-method.md#built).
import { bindingOf, branchOf, bundleOf, config, gitLines, globRegex, list, msg, nameOf, plug, registry, render, seam, tryGit, withDefaults } from '../../lib/index.mjs';

// The slices a bolt lists in its one domain, each with its declaration and its cuts as paths, the pack's slicePaths read
// from the bottom, the shared layers before the slice's own code; null for a bolt that binds no one domain.
function slicesOf(top, bolt, profile) {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(top)?.manifest, { domains, horizontal } = bindingOf(bolt, profile);
  if (!m?.slicePaths || domains.length !== 1 || horizontal.length) return null;
  const [domain] = domains, order = Object.keys(m.slicePaths).reverse();
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

// What the pack's graph shows of each declared slice: SLICE-DATA, a data edge from its own code's folders to a node it
// does not declare; SLICE-ROUTE, its entry not importing its domain's interface layer, or a runtime no slice of the
// domain names importing it (docs/design/slice-method.md#proved). Returns [{ code, path, key, data }].
export function graphFindings(root, profile) {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(root)?.manifest;
  if (!m?.slicePaths) return [];
  const edges = stacks.graph(root, profile) ?? [], bundle = bundleOf(root, withDefaults(profile)), out = [], mods = profile.modules ?? [];
  const prefix = profile.architecture?.data?.prefix ?? config.packs.dataPrefix, under = (p, at) => p === at || p.startsWith(`${at}/`);
  const own = Object.entries(m.slicePaths).filter(([, p]) => p.includes('{{slice}}') && !new RegExp(m.sources).test(p)).map(([cut]) => cut);
  const runtimes = mods.filter((x) => x.kind === config.slices.declaration.runtime), id = (x) => String(x.id ?? x.name);
  const inRuntime = (rt, from) => list(rt.paths).some((g) => globRegex(g).test(`${from}/`));
  for (const domain of mods.filter((x) => x.kind === 'domain').map(id)) {
    const declared = (stacks.listed(bundle, domain) ?? []).map((slice) => ({ slice, decl: stacks.declared(root, profile, domain, slice) })).filter((s) => s.decl?.cuts.length);
    for (const { slice, decl } of declared) {
      const folders = own.filter((cut) => decl.cuts.includes(cut)).map((cut) => stacks.path(m, domain, slice, cut));
      for (const [from, to] of edges.filter(([f, t]) => t.startsWith(prefix) && folders.some((at) => under(f, at)) && !list(decl.data).some((g) => globRegex(g).test(t)))) {
        out.push({ code: 'SLICE-DATA', path: from, key: 'sliceDataEdge', data: { slice: `${domain}/${slice}`, node: to } });
      }
    }
    const iface = `${render(m.folders.domain, { domain })}/${m.layers.interface}`, entries = new Set(declared.map((s) => s.decl.entry).filter(Boolean));
    const wires = (rt) => edges.filter(([f, t]) => inRuntime(rt, f) && under(t, iface));
    for (const rt of runtimes) {
      if (entries.has(id(rt)) && !wires(rt).length) out.push({ code: 'SLICE-ROUTE', path: iface, key: 'sliceEntryUnwired', data: { runtime: id(rt), domain, layer: iface, slices: declared.filter((s) => s.decl.entry === id(rt)).map((s) => s.slice).join(', ') } });
      if (entries.size && !entries.has(id(rt))) for (const [from] of wires(rt)) out.push({ code: 'SLICE-ROUTE', path: from, key: 'sliceEntryOther', data: { runtime: id(rt), domain, entries: [...entries].join(', ') } });
    }
  }
  return out;
}
// At the gate, as the stacks' slice checks: only findings where the bolt changed a file count.
plug('gateChecks', (tree, profile, paths = []) => graphFindings(tree, profile).filter((f) => paths.some((p) => p === f.path || p.startsWith(`${f.path}/`))));
