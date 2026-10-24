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
const rootOf = (glob) => { const parts = glob.replace(/^\.?\//, '').split('/'); const k = parts.findIndex((p) => /[*?[]/.test(p)); return parts.slice(0, k < 0 ? parts.length : k).join('/'); };

// The map's text, or null when the profile turns it off or has no modules.
export function mapText(cwd, profile) {
  const mods = (profile.modules ?? []).map((m) => ({ ...m, id: String(m.id ?? m.name) }));
  if (profile.map === false || !mods.length) return null;
  const of = (p) => mods.find((m) => list(m.paths).some((g) => globRegex('/' + g).test(p) || globRegex('/' + g).test(p + '/')));
  // The tree: every module root and its parents, plus top-level folders no module covers.
  const nodes = new Map();
  for (const m of mods) for (const root of list(m.paths).map(rootOf).filter(Boolean)) nodes.set(root, [...(nodes.get(root) ?? []), m]);
  for (const top of new Set(gitLines(cwd, 'ls-files').filter((f) => f.includes('/')).map((f) => f.split('/')[0]))) if (!of(top) && ![...nodes.keys()].some((n) => n.startsWith(top + '/'))) nodes.set(top, null);
  for (const n of [...nodes.keys()]) n.split('/').slice(0, -1).forEach((_, k, all) => { const p = n.split('/').slice(0, k + 1).join('/'); if (!nodes.has(p)) nodes.set(p, []); });
  const sorted = [...nodes.keys()].sort();
  const lines = ['.'];
  const draw = (parent, pad) => {
    const kids = sorted.filter((n) => n.startsWith(parent ? parent + '/' : '') && n.split('/').length === (parent ? parent.split('/').length + 1 : 1));
    kids.forEach((n, k) => {
      const last = k === kids.length - 1;
      const at = nodes.get(n);
      const about = at === null ? M.noModule : at.map((m) => [m.id, list(m.data).length && msg('mapOwns', { data: list(m.data).join(', ') }), list(m.api).length && msg('mapApi', { api: list(m.api).join(', ') })].filter(Boolean).join(M.sep)).join('; ');
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
  const node = (id) => id.replace(/[^\w]/g, '_');
  const table = mods.map((m) => msg('mapRow', { id: m.id, uses: [...deps.get(m.id)].sort().join(', ') || '-', usedBy: pairs.filter(([, b]) => b === m.id).map(([a]) => a).sort().join(', ') || '-' })).join('');
  const flow = pairs.length ? [pairs.map(([a, b]) => `  ${node(a)}[${a}] --> ${node(b)}[${b}]`).join('\n')] : [];
  const body = (rows) => msg('mapBody', { tree: lines.join('\n'), flow, table: rows });
  const full = body(flow.length ? [table] : []);
  return full.length > M.cap ? body([]) : full;
}

// Writes the map when its body changed; returns the file written, or null.
export function writeMap(cwd, profile) {
  const text = mapText(cwd, profile);
  if (text === null) return null;
  const file = join(bundleOf(cwd, profile), typeof profile.map === 'string' ? profile.map : M.file);
  const old = existsSync(file) ? parseDoc(readFileSync(file, 'utf8')) : null;
  if (old?.fm && old.lines.slice(old.body).join('\n') === text) return null;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, msg('mapDoc', { producer: msg('producer', { version: existsSync(join(CLI_DIR, M.versionFile)) ? readFileSync(join(CLI_DIR, M.versionFile), 'utf8').trim() : readJson(join(CLI_DIR, M.manifest))?.version }), at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), body: text }));
  return file;
}

export const commands = {
  map(args, { cwd }) {
    const file = writeMap(cwd, withDefaults(loadProfile(cwd).profile));
    return done(msg(file ? 'mapWritten' : 'mapSame', { file }));
  },
};
