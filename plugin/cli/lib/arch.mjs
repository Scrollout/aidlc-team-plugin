// The architecture model's checks over the dependency graph: kinds, layers and a runtime's reach (docs/design/architecture-model.md).
import { config, list } from './config.mjs';
import { finding as codeFinding, msg } from './template.mjs';
import { globRegex } from './gate.mjs';

const V = config.vocabulary;
const finding = (code, path, key, data) => codeFinding(config.gate.codes, code, path, 1, key, data);
const hit = (globs, path) => list(globs).some((g) => globRegex(`/${g}`).test(path) || globRegex(`/${g}`).test(`${path}/`));
const modsOf = (profile) => (profile.modules ?? []).map((m) => ({ ...m, id: String(m.id ?? m.name) }));
const moduleAt = (mods, path) => mods.find((m) => hit(m.paths, path));
// A module's surface: its client and events, or a v1 module's api.
const surfaceOf = (m) => (m.surfaces ? [...list(m.surfaces.client), ...list(m.surfaces.events)] : list(m.api));
const inSurface = (m, path) => hit(surfaceOf(m), path);
const layerOf = (m, path) => { const l = Object.entries(m.layers ?? {}).find(([, globs]) => hit(globs, path))?.[0]; return l && (V.layerAliases[l] ?? l); };

// An edge the kind table forbids: by the depending module's kind, the kinds it may reach and the surface it must use.
export function kindFindings(edges, profile) {
  const mods = modsOf(profile), out = [];
  for (const [from, to] of edges) {
    const [a, b] = [moduleAt(mods, from), moduleAt(mods, to)];
    if (!a?.kind || !b?.kind || a === b) continue;
    const allowed = V.kindRules[a.kind] ?? [];
    if (allowed.includes(b.kind)) continue;
    if (allowed.includes(`${b.kind}:surface`) && inSurface(b, to)) continue;
    const note = allowed.includes(`${b.kind}:surface`) ? msg('archKindSurface', { surface: surfaceOf(b).join(', ') || '-' }) : '';
    out.push(finding('ARCH-KIND', from, 'archKind', { from, to, fromKind: a.kind, a: a.id, toKind: b.kind, b: b.id, note }));
  }
  return out;
}

// An outward edge between a module's layers, and a model depending on anything but a foundation kit.
export function layerFindings(edges, profile) {
  const mods = modsOf(profile), out = [];
  for (const [from, to] of edges) {
    const a = moduleAt(mods, from), b = moduleAt(mods, to), fromLayer = a && layerOf(a, from);
    if (!fromLayer || !(fromLayer in V.layerRules)) continue;
    if (a === b) {
      const toLayer = layerOf(a, to);
      if (toLayer && toLayer !== fromLayer && toLayer in V.layerRules && !V.layerRules[fromLayer].includes(toLayer)) out.push(finding('ARCH-LAYER', from, 'archLayer', { from, to, fromLayer, toLayer, module: a.id }));
    } else if (fromLayer === 'model' && b?.kind && b.kind !== 'foundation') out.push(finding('ARCH-LAYER', from, 'archLayerModel', { from, to, module: a.id, b: b.id, toKind: b.kind }));
  }
  return out;
}

// A runtime hosts the domains whose internals it imports directly; through anything it links it may reach only
// the surfaces of the others (docs/design/architecture-model.md#checks).
export function reachFindings(edges, profile) {
  const mods = modsOf(profile), out = [], next = new Map();
  for (const [from, to] of edges) next.set(from, [...(next.get(from) ?? []), to]);
  for (const r of mods.filter((m) => m.kind === 'runtime')) {
    const starts = [...next.keys()].filter((p) => hit(r.paths, p));
    const hosts = new Set(starts.flatMap((p) => next.get(p)).map((p) => [p, moduleAt(mods, p)]).filter(([p, m]) => m?.kind === 'domain' && !inSurface(m, p)).map(([, m]) => m.id));
    const via = new Map(starts.map((p) => [p, [p]])), queue = [...starts], reported = new Set();
    while (queue.length) {
      const p = queue.shift();
      for (const q of next.get(p) ?? []) {
        if (via.has(q)) continue;
        via.set(q, [...via.get(p), q]);
        queue.push(q);
        const d = moduleAt(mods, q);
        if (d?.kind === 'domain' && !hosts.has(d.id) && !inSurface(d, q) && !reported.has(d.id)) {
          reported.add(d.id);
          out.push(finding('ARCH-REACH', r.paths?.[0] ?? '.', 'archReach', { runtime: r.id, at: q, domain: d.id, path: via.get(q).join(config.gate.edge) }));
        }
      }
    }
  }
  return out;
}
