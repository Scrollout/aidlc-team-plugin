// The architecture checks over the dependency graph: boundaries, data owners, surfaces and cycles (docs/design/data-ownership.md,
// docs/design/module-surface.md), and the architecture model's kinds, layers and a runtime's reach (docs/design/architecture-model.md).
import { config, list } from '../foundation/data.mjs';
import { finding as codeFinding, msg } from '../foundation/text.mjs';
import { globRegex } from '../foundation/glob.mjs';
import { sh } from '../foundation/git.mjs';

const V = config.vocabulary;
const finding = (code, path, key, data) => codeFinding(config.gate.codes, code, path, 1, key, data);
const hit = (globs, path) => list(globs).some((g) => globRegex(`/${g}`).test(path) || globRegex(`/${g}`).test(`${path}/`));
const modsOf = (profile) => (profile.modules ?? []).map((m) => ({ ...m, id: String(m.id ?? m.name) }));
const moduleAt = (mods, path) => mods.find((m) => hit(m.paths, path));
// A module's surface: its client and events, or a v1 module's api.
const surfaceOf = (m) => (m.surfaces ? [...list(m.surfaces.client), ...list(m.surfaces.events)] : list(m.api));
const inSurface = (m, path) => hit(surfaceOf(m), path);
const layerOf = (m, path) => { const l = Object.entries(m.layers ?? {}).find(([, globs]) => hit(globs, path))?.[0]; return l && (V.layerAliases[l] ?? l); };


export const exceptDocs = (arch) => [...(arch.boundaries ?? []).flatMap((b) => list(b.except)), ...[arch.data, arch.api, arch.acyclic].flatMap((r) => list(r?.except))];

// Denied edges of the dependency graph the project's `architecture.graph` command prints. An approved
// `except` decision covers the edges it lists as `<from> -> <to>` lines, or the whole boundary if it lists none.
const excepted = (docs, approved, from, to) => list(docs).filter((d) => approved.has(d)).map((d) => approved.get(d).split('\n').map((l) => l.replace(/^\s*[-*]\s+|`/g, '').trim())).some((t) => !t.some((l) => l.includes(config.gate.edge)) || t.includes(`${from}${config.gate.edge}${to}`));

export function boundaryFindings(edges, architecture, approved = new Map()) {
  const out = [];
  for (const [from, to] of edges) {
    for (const b of architecture.boundaries ?? []) {
      if (excepted(b.except, approved, from, to)) continue;
      const fm = from.match(globRegex(b.from));
      if (!fm) continue;
      for (const deny of list(b.deny)) {
        const tm = to.match(globRegex(deny));
        if (!tm) continue;
        if (b.same === false && fm.slice(1).join('/') === tm.slice(1).join('/')) continue;
        out.push(finding('ARCH-BOUNDARY', from, 'archEdge', { from, to, reason: b.reason ?? deny }));
      }
    }
  }
  return out;
}

// Module rules over the graph: data owners, public surfaces and cycles.
export function moduleFindings(edges, profile, approved = new Map()) {
  const { data, api, acyclic } = profile.architecture ?? {};
  const mods = modsOf(profile), out = [];
  const [seen, links] = [new Set(), new Map()];
  for (const [from, to] of edges) {
    const [a, b] = [moduleAt(mods, from), moduleAt(mods, to)];
    if (data?.prefix && to.startsWith(data.prefix)) {
      const owners = mods.filter((m) => hit(m.data, to));
      if (!seen.has(to) && (seen.add(to), owners.length > 1)) out.push(finding('ARCH-DATA', to, 'archDataTwice', { to, owners: owners.map((m) => m.id).join(', ') }));
      if (owners.includes(a) || (!owners.length && hit(data.shared, to)) || excepted(data.except, approved, from, to)) continue;
      out.push(finding('ARCH-DATA', from, owners.length ? 'archDataEdge' : 'archDataNoOwner', { from, to, owner: owners.map((m) => m.id).join(', ') }));
    } else if (a && b && a !== b) {
      // With kinds on both ends the kind table decides (ARCH-KIND); otherwise a module's surface does.
      const surface = surfaceOf(b);
      if (!(a.kind && b.kind) && surface.length && !hit(surface, to) && !excepted(api?.except, approved, from, to)) out.push(finding('ARCH-API', from, 'archApi', { from, to, module: b.id, api: surface.join(', ') }));
      if (acyclic && !excepted(acyclic.except, approved, a.id, b.id)) links.set(a.id, new Set([...(links.get(a.id) ?? []), b.id]));
    }
  }
  // One circle per set of modules: the shortest way back to each start, breadth first.
  const circles = new Set();
  for (const start of links.keys()) {
    const back = new Map([[start, null]]);
    const queue = [start];
    let id;
    while ((id = queue.shift()) !== undefined && !links.get(id)?.has(start)) for (const n of links.get(id) ?? []) if (!back.has(n)) back.set(n, id), queue.push(n);
    const circle = id === undefined ? [] : [id];
    while (circle.length && circle[0] !== start) circle.unshift(back.get(circle[0]));
    if (circle.length && !circles.has([...circle].sort().join())) circles.add([...circle].sort().join()), out.push(finding('ARCH-CYCLE', '.', 'archCycle', { circle: [...circle, start].join(config.gate.edge) }));
  }
  return out;
}

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

// The project's dependency graph, run once per tree: the codebase map and the architecture checks share it.
const graphs = new Map();
export function graphOf(cwd, command) {
  if (!graphs.has(cwd + command)) {
    const r = sh(cwd, command);
    graphs.set(cwd + command, { ok: r.status === 0, edges: (r.stdout ?? '').split('\n').map((l) => l.split(config.gate.edge).map((x) => x.trim())).filter((e) => e.length === 2 && e[0] && e[1]) });
  }
  return graphs.get(cwd + command);
}
