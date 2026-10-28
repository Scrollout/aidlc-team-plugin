// What a bolt's slices give its card and its board item, read through the stack pack the stacks extension finds
// (docs/design/slice-method.md#built).
import { bindingOf, branchOf, bundleOf, gitLines, list, msg, nameOf, plug, registry, seam, tryGit, withDefaults } from '../../lib/index.mjs';

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
