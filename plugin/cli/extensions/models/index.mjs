// Architecture models: a proven system's vertical and horizontal shape as data, shipped with the CLI or kept by a
// project, the project's own winning (docs/design/models.md, decision 0020).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_DIR, config, done, msg, parseDoc, plug, relPath } from '../../lib/index.mjs';

const M = config.models;
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

plug('docChecks', (root) => modelsOf(root).flatMap((m) => m.problems.map(([key, data]) => ({ code: 'MODEL-FORMAT', path: relPath(root, join(m.dir, M.file)), key, data }))));

export const commands = {
  models(args, { cwd }) {
    const all = modelsOf(cwd);
    if (!all.length) return done(msg('modelNone', { dir: M.local }));
    return done(all.map((m) => msg('modelLine', { name: m.name, source: m.source, title: m.data?.title ?? '-', problems: m.problems.length ? msg('modelProblems', { count: m.problems.length }) : '' })).join(''));
  },
};
