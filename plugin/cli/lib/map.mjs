// The codebase map: the modules as a tree with their data, public paths and dependencies, written from the profile
// and the dependency graph so it never drifts (docs/design/codebase-map.md).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { bundleOf, CLI_DIR, config, done, gitLines, list, readJson } from './config.mjs';
import { msg } from './template.mjs';
import { loadProfile, withDefaults } from './profile.mjs';
import { parseDoc } from './okf.mjs';
import { globRegex, graphOf } from './gate.mjs';

const M = config.map;
const layersOf = (m) => Object.keys(m.layers ?? {}); // a module's layers, outer to inner (U142)
const rootOf = (glob) => { const parts = glob.replace(/^\.?\//, '').split('/'); const k = parts.findIndex((p) => /[*?[]/.test(p)); return parts.slice(0, k < 0 ? parts.length : k).join('/'); };

// The map's pages, or null when the profile turns it off or has no modules.
export function mapText(cwd, profile) {
  const mods = (profile.modules ?? []).map((m) => ({ ...m, id: String(m.id ?? m.name) }));
  if (profile.map === false || !mods.length) return null;
  const of = (p) => mods.find((m) => list(m.paths).some((g) => globRegex('/' + g).test(p) || globRegex('/' + g).test(p + '/')));
  // The tree: every module root and its parents, plus top-level folders no module covers.
  const nodes = new Map();
  for (const m of mods) for (const root of list(m.paths).map(rootOf).filter(Boolean)) nodes.set(root, [...(nodes.get(root) ?? []), m]);
  for (const top of new Set(gitLines(cwd, 'ls-files').filter((f) => f.includes('/')).map((f) => f.split('/')[0]))) if (!of(top) && ![...nodes.keys()].some((n) => n.startsWith(top + '/'))) nodes.set(top, null);
  for (const n of [...nodes.keys()]) n.split('/').slice(0, -1).forEach((_, k, all) => { const p = n.split('/').slice(0, k + 1).join('/'); if (!nodes.has(p)) nodes.set(p, []); });
  const [sorted, lines] = [[...nodes.keys()].sort(), ['.']];
  const draw = (parent, pad) => {
    const kids = sorted.filter((n) => n.startsWith(parent ? parent + '/' : '') && n.split('/').length === (parent ? parent.split('/').length + 1 : 1));
    kids.forEach((n, k, all) => {
      const [last, at] = [k === all.length - 1, nodes.get(n)];
      const about = at === null ? M.noModule : at.map((m) => [m.id, layersOf(m).length && msg('mapLayers', { layers: layersOf(m).join(' → ') }), list(m.data).length && msg('mapOwns', { data: list(m.data).join(', ') }), list(m.api).length && msg('mapApi', { api: list(m.api).join(', ') })].filter(Boolean).join(M.sep)).join('; ');
      lines.push(`${pad}${last ? M.last : M.branch}${n.split('/').at(-1)}/${about ? ` — ${about}` : ''}`);
      draw(n, pad + (last ? M.space : M.pipe));
    });
  };
  draw('', '');
  // Dependencies between modules, from the graph's code edges.
  const graph = profile.architecture?.graph ? graphOf(cwd, profile.architecture.graph) : { edges: [] };
  const deps = new Map(mods.map((m) => [m.id, new Set()]));
  for (const [from, to] of graph.edges) { const [a, b] = [of(from), of(to)]; if (a && b && a !== b) deps.get(a.id).add(b.id); }
  const pairs = [...deps].flatMap(([a, bs]) => [...bs].sort().map((b) => [a, b]));
  const ids = [...new Set(pairs.flat())].sort();
  const n = (id) => `n${ids.indexOf(id)}`; // short node ids keep the diagram small; the label is the module
  const flow = [...ids.map((id) => `  ${n(id)}[${id}]`), ...pairs.map(([a, b]) => `  ${n(a)} --> ${n(b)}`)].join('\n');
  const table = mods.map((m) => msg('mapRow', { id: m.id, uses: [...deps.get(m.id)].sort().join(', ') || '-', usedBy: pairs.filter(([, b]) => b === m.id).map(([a]) => a).sort().join(', ') || '-' })).join('');
  // Vertical slices across horizontal layers: one subgraph per slice, its layers outer to inner, and the matrix (U142).
  const [layered, names] = [mods.filter((m) => layersOf(m).length), [...new Set(mods.flatMap(layersOf))]];
  const slices = layered.map((m, i) => [`  subgraph s${i}[${m.id}]`, ...layersOf(m).map((l, k) => `    s${i}l${k}[${l}]`), ...layersOf(m).slice(1).map((_, k) => `    s${i}l${k} --> s${i}l${k + 1}`), '  end'].join('\n')).join('\n');
  const matrix = [`| Slice | ${names.join(' | ')} |`, `|---|${names.map(() => '---|').join('')}`, ...layered.map((m) => `| ${m.id} | ${names.map((l) => list(m.layers[l]).join(', ') || '-').join(' | ')} |`)].join('\n');
  // One page per part, each small enough for an agent to load: the tree, the diagram, the table.
  const base = (typeof profile.map === 'string' ? profile.map : M.file).replace(/\.md$/, '');
  const pages = M.pages.filter((pg) => !pg.needs || { pairs: pairs.length, layers: layered.length }[pg.needs]).map((pg) => ({ ...pg, file: `${base}${pg.suffix}.md` }));
  const link = (pg) => msg('mapLink', { title: pg.title, file: pg.file.split('/').at(-1) });
  return pages.map((pg) => ({ ...pg, body: msg(pg.body, { tree: lines.join('\n'), flow, table, slices, matrix, links: pages.filter((x) => x !== pg).map(link) }) }));
}

// Writes each page whose body changed; returns the files written.
export function writeMap(cwd, profile) {
  const written = [];
  for (const pg of mapText(cwd, profile) ?? []) {
    const file = join(bundleOf(cwd, profile), pg.file);
    const old = existsSync(file) ? parseDoc(readFileSync(file, 'utf8')) : null;
    if (old?.fm && old.lines.slice(old.body).join('\n') === pg.body) continue;
    mkdirSync(dirname(file), { recursive: true });
    const version = existsSync(join(CLI_DIR, M.versionFile)) ? readFileSync(join(CLI_DIR, M.versionFile), 'utf8').trim() : readJson(join(CLI_DIR, M.manifest))?.version;
    writeFileSync(file, msg('mapDoc', { ...pg, producer: msg('producer', { version }), at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }));
    written.push(file);
  }
  return written;
}

export const commands = {
  map(args, { cwd }) {
    const files = writeMap(cwd, withDefaults(loadProfile(cwd).profile));
    return done(msg(files.length ? 'mapWritten' : 'mapSame', { files: files.join(', ') }));
  },
};
