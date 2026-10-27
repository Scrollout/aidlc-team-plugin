// The codebase map: the modules as a tree with their data, public paths and dependencies, written from the profile
// and the dependency graph so it never drifts (docs/design/codebase-map.md).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { bundleOf, CLI_DIR, config, done, list, readJson } from '../foundation/data.mjs';
import { gitLines } from '../foundation/git.mjs';
import { msg } from '../foundation/text.mjs';
import { loadProfile, withDefaults } from '../foundation/profile.mjs';
import { digestOf, parseDoc, sectionOf } from './bundle.mjs';
import { graphOf } from './architecture.mjs';
import { globRegex } from '../foundation/glob.mjs';
import { glossaryOf } from './naming.mjs';

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
      const about = at === null ? M.noModule : at.map((m) => [m.id, m.kind && msg('mapKind', { kind: m.kind }), layersOf(m).length && msg('mapLayers', { layers: layersOf(m).join(' → ') }), list(m.data).length && msg('mapOwns', { data: list(m.data).join(', ') }), list(m.api).length && msg('mapApi', { api: list(m.api).join(', ') })].filter(Boolean).join(M.sep)).join('; ');
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
  // The modules by kind: domains side by side, each with its layers outer to inner, the horizontal kinds as bands
  // across them in the order of map.bands, and delivery left out (docs/design/architecture-model.md).
  const kindOf = (m) => m.kind ?? M.noKind;
  const rank = (m) => (M.bands.includes(kindOf(m)) ? M.bands.indexOf(kindOf(m)) : M.bands.length); // no kind last
  const shown = mods.filter((m) => m.kind !== 'delivery').sort((a, b) => rank(a) - rank(b));
  const names = [...new Set(shown.flatMap(layersOf))];
  const box = (m, i) => (layersOf(m).length ? [`    subgraph m${i}[${m.id}]`, ...layersOf(m).map((l, k) => `      m${i}l${k}[${l}]`), ...layersOf(m).slice(1).map((_, k) => `      m${i}l${k} --> m${i}l${k + 1}`), '    end'] : [`    m${i}[${m.id}]`]);
  const bands = [...new Set(shown.map(kindOf))].map((kind, b) => [`  subgraph b${b}[${kind}]`, '    direction LR', ...shown.flatMap((m, i) => (kindOf(m) === kind ? box(m, i) : [])), '  end'].join('\n')).join('\n');
  const matrix = [`| Kind | Module | ${names.join(' | ')} |`, `|---|---|${names.map(() => '---|').join('')}`, ...shown.map((m) => `| ${kindOf(m)} | ${m.id} | ${names.map((l) => list(m.layers?.[l]).join(', ') || '-').join(' | ')} |`)].join('\n');
  // One page per part, each small enough for an agent to load: the tree, the diagram, the table.
  const base = (typeof profile.map === 'string' ? profile.map : profile.system ? M.fileV2 : M.file).replace(/\.md$/, ''); // a v2 bundle keeps generated maps in architecture/
  const pages = M.pages.filter((pg) => !pg.needs || { pairs: pairs.length, kinds: shown.some((m) => m.kind) }[pg.needs]).map((pg) => ({ ...pg, file: `${base}${pg.suffix}.md` }));
  const link = (pg) => msg('mapLink', { title: pg.title, file: pg.file.split('/').at(-1) });
  return pages.map((pg) => ({ ...pg, body: msg(pg.body, { tree: lines.join('\n'), flow, table, bands, matrix, links: pages.filter((x) => x !== pg).map(link) }) }));
}

// Writes a generated page when its body changed, with its producer and digest; returns the files written. The map
// also rewrites a page from before generated docs carried a digest.
export function writePage(file, body, key, data = {}, digested = false) {
  const old = existsSync(file) ? parseDoc(readFileSync(file, 'utf8')) : null;
  if (old?.fm && old.lines.slice(old.body).join('\n') === body && (!digested || old.fm.generated?.digest)) return [];
  mkdirSync(dirname(file), { recursive: true });
  const version = existsSync(join(CLI_DIR, M.versionFile)) ? readFileSync(join(CLI_DIR, M.versionFile), 'utf8').trim() : readJson(join(CLI_DIR, M.manifest))?.version;
  writeFileSync(file, msg(key, { ...data, body, producer: msg('producer', { version }), digest: digestOf(body), at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }));
  return [file];
}

export const writeMap = (cwd, profile) => (mapText(cwd, profile) ?? [])
  .flatMap((pg) => writePage(join(bundleOf(cwd, profile), pg.file), pg.body, 'mapDoc', pg, true));

export const commands = {
  map(args, { cwd }) {
    const profile = withDefaults(loadProfile(cwd).profile), files = [...writeMap(cwd, profile), ...writeGlossary(cwd, profile), ...writeContextMap(cwd, profile)];
    return done(msg(files.length ? 'mapWritten' : 'mapSame', { files: files.join(', ') }));
  },
};

// The glossary page, from the domain docs; written beside the map, only when a domain has a glossary entry.
export function writeGlossary(cwd, profile) {
  const entries = glossaryOf(bundleOf(cwd, profile));
  if (!entries.length) return [];
  const body = msg('glossaryBody', { rows: entries.map((e) => msg('glossaryRow', { ...e, avoid: e.synonyms.join(', ') || '-' })).join('') });
  return writePage(join(bundleOf(cwd, profile), config.naming.glossary.file), body, 'glossaryDoc');
}

// The context map: each domain doc's relationships (`- <domain>: upstream|downstream, <pattern>`), drawn upstream to
// downstream at every merge (docs/design/inception.md#domains).
export function writeContextMap(cwd, profile) {
  const bundle = bundleOf(cwd, profile), dir = join(bundle, config.okf.bundle.folders.Domain), G = config.naming.glossary;
  const docs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== config.okf.index).sort().map((f) => parseDoc(readFileSync(join(dir, f), 'utf8'))).filter((d) => d.fm?.code) : [];
  if (!docs.length) return [];
  const codes = docs.map((d) => String(d.fm.code)), edges = new Set();
  for (const d of docs) for (const [, t] of sectionOf(d, G.relationships)) {
    const m = t.match(/^\s*[-*]\s+([a-z][a-z0-9]*):\s*(upstream|downstream)\s*,\s*([^<>\n]+?)\s*$/);
    if (m && codes.includes(m[1])) edges.add(m[2] === 'upstream' ? `  ${m[1]} -->|${m[3]}| ${d.fm.code}\n` : `  ${d.fm.code} -->|${m[3]}| ${m[1]}\n`);
  }
  const body = msg('contextMapBody', { nodes: codes.map((c) => `  ${c}[${c}]\n`).join(''), edges: [...edges].sort().join('') });
  return writePage(join(bundle, G.contextMap), body, 'contextMapDoc');
}
