// What a bolt's slices give its card, read through the stack pack the stacks extension finds
// (docs/design/slice-method.md#built).
import { bindingOf, bundleOf, list, msg, nameOf, plug, registry, seam, withDefaults } from '../../lib/index.mjs';

// The card of a bolt that lists slices of its one domain: each slice's scaffold command, then each cut it declares, the
// pack's slicePaths read from the bottom, the shared layers before the slice's own code.
plug('cardSlices', (top, bolt, profile) => {
  const [stacks] = seam('sliceDeclaration', profile), m = stacks?.pack(top)?.manifest, { domains, horizontal } = bindingOf(bolt, profile);
  if (!m?.slicePaths || domains.length !== 1 || horizontal.length) return [];
  const [domain] = domains, order = Object.keys(m.slicePaths).reverse(), reg = profile.naming && registry(profile, bundleOf(top, withDefaults(profile)));
  // scaffold takes the verb the registry composes the slice's name from
  const verbOf = (slice) => (reg?.vocabularies.verb ?? []).find((verb) => { try { return nameOf('slice', { domain, verb }, reg) === slice; } catch { return false; } });
  const slices = list(bolt.fm?.slices).map((slice) => {
    const cuts = stacks.declared(top, profile, domain, slice) ?? [];
    const steps = order.filter((c) => cuts.includes(c)).map((cut, k) => msg('cardSliceStep', { n: k + 1, cut, path: stacks.path(m, domain, slice, cut) })).join('');
    const verb = verbOf(slice), scaffold = verb ? msg('cardSliceScaffold', { verb, domain }) : '';
    return steps ? msg('cardSlice', { slice, scaffold, steps }) : '';
  }).join('');
  return slices ? [msg('cardSlices', { slices })] : [];
});
