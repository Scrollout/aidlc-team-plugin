// Architecture models: a proven system's vertical and horizontal shape as data, shipped with the CLI or kept by a
// project, the project's own winning (docs/design/models.md, decision 0020).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleOf, CLI_DIR, config, done, list, loadProfile, msg, parseDoc, plug, readJson, relPath, UsageError } from '../../lib/index.mjs';

const M = config.models, F = config.okf.bundle.folders;
const sha16 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const folders = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort() : []);

// Every model the project can see, by name: the shipped ones, then its own, which replace a shipped one of the same name.
function modelsOf(root) {
  const out = new Map();
  for (const [source, dir] of [['shipped', join(CLI_DIR, M.dir)], ['project', join(root, M.local)]]) for (const name of folders(dir)) out.set(name, { name, source, dir: join(dir, name) });
  return [...out.values()].map((m) => ({ ...m, ...read(m) }));
}

function read(m) {
  const file = join(m.dir, M.file);
  if (!existsSync(file)) return { problems: [['modelNoFile', { model: m.name, file: M.file }]] };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { data, problems: problems(m, data) };
  } catch (e) {
    return { problems: [['modelUnreadable', { model: m.name, error: e.message }]] };
  }
}

// What breaks the format: missing keys, lists that are not, ids missing or twice, unknown kinds, rule types and
// contract ends, and decisions that are not Decision docs.
function problems(m, d) {
  const out = [], add = (key, data = {}) => out.push([key, { model: m.name, ...data }]);
  for (const key of M.required.filter((k) => d[k] === undefined || d[k] === '')) add('modelKey', { key });
  if (d.name !== undefined && d.name !== m.name) add('modelName', { name: d.name });
  for (const key of M.lists.filter((k) => d[k] !== undefined && !Array.isArray(d[k]))) add('modelList', { key });
  if (Array.isArray(d.layers) && !d.layers.length) add('modelNoLayers');
  const ids = new Set(), kinds = config.vocabulary.kinds;
  for (const key of ['layers', 'domains']) for (const x of Array.isArray(d[key]) ? d[key] : []) {
    if (!x?.id) add('modelItemId', { key });
    else if (ids.has(x.id)) add('modelItemTwice', { id: x.id });
    else ids.add(x.id);
    if (x?.kind && !kinds.includes(x.kind)) add('modelKind', { id: x.id ?? '-', kind: x.kind, kinds: kinds.join(', ') });
  }
  for (const r of Array.isArray(d.rules) ? d.rules : []) if (!M.ruleTypes.includes(r?.type)) add('modelRule', { type: r?.type ?? '-', types: M.ruleTypes.join(', ') });
  for (const c of Array.isArray(d.contracts) ? d.contracts : []) for (const end of ['from', 'to']) if (c?.[end] !== undefined && !ids.has(c[end]) && c[end] !== M.sliceId) add('modelContract', { end, id: c[end] });
  const dir = join(m.dir, M.decisions);
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.md')).sort() : []) {
    if (parseDoc(readFileSync(join(dir, f), 'utf8')).fm?.type !== config.grid.decisionType) add('modelDecision', { file: f });
  }
  return out;
}

// A project model by name, and the research digests a list names (files under research/), with their sources.
const project = (root, name) => modelsOf(root).find((m) => m.name === name && m.source === 'project');
const digests = (bundle, names) => list(names).map((n) => join(bundle, M.research, `${n}.md`)).filter(existsSync).map((f) => parseDoc(readFileSync(f, 'utf8')).fm?.sources ?? []);
// A model's items that carry sources: its layers, its domains, and its rules by id or type.
const items = (d) => [...(d.layers ?? []), ...(d.domains ?? []), ...(d.rules ?? []).map((r) => ({ ...r, id: r.id ?? r.type }))];

// The Model doc the owner approves, drawn from model.json with its sources as footnotes (docs/design/models.md#modelling-a-reference).
function modelDoc(cwd, name) {
  const { profile } = loadProfile(cwd), bundle = bundleOf(cwd, profile), m = name && project(cwd, name);
  if (!m?.data) throw new UsageError(msg(name ? 'modelUnknown' : 'modelsUsage', { name, dir: M.local }));
  const d = m.data, H = M.docHeadings, sources = new Map(digests(bundle, d.research).flat().map((s) => [String(s.id), s]));
  const cite = (x) => list(x.sources).map((s) => `[^${s}]`).join('');
  const line = (x) => `- **${x.id}** (${x.kind ?? '-'}): ${x.role ?? ''} ${cite(x)}`.trimEnd();
  const used = [...new Set(items(d).flatMap((x) => list(x.sources)))].filter((s) => sources.has(s));
  const body = ['', `# ${H.layers}`, ...d.layers.map(line), '', `# ${H.domains}`, ...(d.domains ?? []).map(line), '', `# ${H.slice}`, ...Object.entries(d.slice ?? {}).map(([k, v]) => `- ${k}: ${[v].flat().join(', ')}`),
    '', `# ${H.contracts}`, ...(d.contracts ?? []).map((c) => `- ${c.from} → ${c.to}${c.via ? ` via ${c.via}` : ''}`), '', `# ${H.rules}`, ...(d.rules ?? []).map((r) => `- ${r.id ?? r.type}: ${r.type} ${cite(r)}`.trimEnd()),
    ...(used.length ? ['', `# ${H.sources}`, ...used.map((s) => `[^${s}]: ${sources.get(s).title ?? s}, ${sources.get(s).resource ?? ''}`.trimEnd())] : [])].join('\n') + '\n';
  const dir = join(bundle, F.Model), file = join(dir, `${name}.md`), at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, msg('modelDoc', { title: JSON.stringify(d.title), description: JSON.stringify(d.description), name, research: list(d.research).join(', '), digest: sha16(readFileSync(join(m.dir, M.file), 'utf8')),
    producer: msg('producer', { version: readJson(join(CLI_DIR, config.map.manifest))?.version ?? config.init.devVersion }), at, bodyDigest: sha16(body), body }));
  return done(msg('modelDocWrote', { path: relPath(cwd, file), file: relPath(cwd, join(m.dir, M.file)) }));
}

// The model pathway's steps: its research digests filed, and a current Model doc of a model in the format.
plug('pathwaySteps', (i, { bundle, base }) => ({
  research: () => list(i.fm.research).length > 0 && list(i.fm.research).every((n) => existsSync(join(bundle, M.research, `${n}.md`))),
  model: () => {
    const name = String(i.fm.model ?? ''), m = name && project(base, name), file = join(bundle, F.Model, `${name}.md`);
    return Boolean(m?.data && !m.problems.length && existsSync(file) && parseDoc(readFileSync(file, 'utf8')).fm?.digest === sha16(readFileSync(join(m.dir, M.file), 'utf8')));
  },
}));

// MODEL-SOURCE: each layer, domain and rule of a project model cites a source of the research its intent names.
plug('planRules', ({ bundle, intents, add, keyLine, base }) => {
  for (const i of intents.filter((x) => x.fm.pathway === 'model' && x.fm.status !== config.grid.dropped)) {
    const m = project(base, String(i.fm.model ?? ''));
    if (!m?.data) continue;
    const known = new Set(digests(bundle, i.fm.research).flat().map((s) => String(s.id)));
    for (const x of items(m.data)) {
      if (!list(x.sources).length) add('MODEL-SOURCE', i, keyLine(i, 'model'), 'modelSourceNone', { model: m.name, item: x.id });
      for (const ref of list(x.sources).filter((r) => !known.has(r))) add('MODEL-SOURCE', i, keyLine(i, 'model'), 'modelSourceUnknown', { model: m.name, item: x.id, ref, research: list(i.fm.research).join(', ') || '-' });
    }
  }
});

plug('docChecks', (root) => modelsOf(root).flatMap((m) => m.problems.map(([key, data]) => ({ code: 'MODEL-FORMAT', path: relPath(root, join(m.dir, M.file)), key, data }))));

export const commands = {
  models(args, { cwd }) {
    if (args[0] === 'doc') return modelDoc(cwd, args[1]);
    if (args.length) throw new UsageError(msg('modelsUsage', {}));
    const all = modelsOf(cwd);
    if (!all.length) return done(msg('modelNone', { dir: M.local }));
    return done(all.map((m) => msg('modelLine', { name: m.name, source: m.source, title: m.data?.title ?? '-', problems: m.problems.length ? msg('modelProblems', { count: m.problems.length }) : '' })).join(''));
  },
};
