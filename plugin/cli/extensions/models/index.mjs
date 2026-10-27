// Architecture models: a proven system's vertical and horizontal shape as data, shipped with the CLI or kept by a
// project, the project's own winning (docs/design/models.md, decision 0020).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundleOf, CLI_DIR, config, docSlug, done, gitLines, globRegex, isMap, list, loadProfile, msg, parseDoc, parseYaml, PLUGIN_DIR, plug, readJson, relPath, sectionOf, templateFile, UsageError, writeJson } from '../../lib/index.mjs';

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

// ---- Rule types: only the chosen model's rules run, with its parameters and the profile's project names ----

const PROFILE = config.layers.find((l) => l.from === 'project').path;
const chosen = (root, profile) => (profile.model?.name ? modelsOf(root).find((m) => m.name === profile.model.name && m.data) ?? null : null);
const rulesOf = (m, type) => (m?.data.rules ?? []).filter((r) => r.type === type);
const has = (map, name) => Boolean(name) && Object.keys(isMap(map) ? map : {}).some((k) => k.toLowerCase() === String(name).toLowerCase());
// Every operation of the project's published OpenAPI documents (the contracts' files), with where it sits.
function operations(root, profile) {
  const globs = (profile.naming?.contracts ?? config.naming.contract.files).map((g) => globRegex(`/${g}`));
  return gitLines(root, 'ls-files', '--cached', '--others', '--exclude-standard').filter((f) => globs.some((g) => g.test(f))).flatMap((file) => {
    let doc; try { const text = readFileSync(join(root, file), 'utf8'); doc = file.endsWith('.json') ? JSON.parse(text) : parseYaml(text); } catch { return []; }
    return Object.entries(isMap(doc?.paths) ? doc.paths : {}).flatMap(([path, item]) => Object.entries(isMap(item) ? item : {}).filter(([k]) => M.methods.includes(k)).map(([method, op]) => ({ file, path, method, op: isMap(op) ? op : {} })));
  });
}

function stageOrder(root, profile, m, r, out) {
  const w = profile.model.wiring ?? {}, file = w.file && join(root, w.file);
  if (!w.file || !w.pattern) return out.push(['PIPELINE-ORDER', PROFILE, 'stageNoWiring', {}]);
  if (!existsSync(file)) return out.push(['PIPELINE-ORDER', PROFILE, 'stageNoFile', { file: w.file }]);
  const found = [...readFileSync(file, 'utf8').matchAll(new RegExp(w.pattern, 'g'))].map((x) => String(x[1] ?? x[0]).toLowerCase());
  const at = list(r.stages).map((s) => [s, found.indexOf(s.toLowerCase())]);
  for (const [stage] of at.filter(([, k]) => k < 0)) out.push(['PIPELINE-ORDER', w.file, 'stageMissing', { stage }]);
  const placed = at.filter(([, k]) => k >= 0).map(([, k]) => k);
  if (placed.some((k, n) => n && k < placed[n - 1])) out.push(['PIPELINE-ORDER', w.file, 'stageOrder', { found: found.join(', '), stages: list(r.stages).join(', ') }]);
}

function sliceContract(root, profile, m, r, out) {
  for (const mod of (profile.modules ?? []).filter((x) => x.kind === r.kind)) {
    const missing = list(r.declares).filter((k) => !isMap(mod.slice) || mod.slice[k] === undefined || mod.slice[k] === '');
    if (missing.length) out.push(['PROVIDER-CONTRACT', PROFILE, 'sliceMissing', { module: mod.id ?? mod.name, kind: r.kind, fields: missing.join(', ') }]);
  }
}

function longRunning(root, profile, m, r, out) {
  const o = { ...M.defaults.operations, ...profile.model.operations }, roles = ['status', 'result', 'retry'].filter((k) => !o[k]);
  if (roles.length) return out.push(['LONG-RUNNING', PROFILE, 'lroNoNames', { roles: roles.join(', ') }]);
  const shapes = list(r.shapes).length ? r.shapes : [];
  const fits = (responses, s) => isMap(responses[String(s.code)]) && [...list(s.links), 'retry'].every((l) => has(responses[String(s.code)].headers, o[l]));
  for (const { file, path, method, op } of operations(root, profile)) {
    const responses = isMap(op.responses) ? op.responses : {};
    if (op[o.marker] === true && !shapes.some((s) => fits(responses, s))) out.push(['LONG-RUNNING', file, 'lroShape', { method: method.toUpperCase(), path, shapes: shapes.map((s) => `${s.code} with ${[...list(s.links).map((l) => o[l]), o.retry].join(' and ')}`).join(', or ') }]);
    if (r.deleteAbsent && method === 'delete' && !(String(r.deleteAbsent) in responses)) out.push(['LONG-RUNNING', file, 'lroDelete', { path, code: r.deleteAbsent }]);
  }
}

function events(root, profile, m, r, out) {
  const e = { ...M.defaults.events, ...profile.model.events };
  if (!list(e.files).length) return out.push(['EVENT-COVERAGE', PROFILE, 'eventsNoFiles', {}]);
  const globs = list(e.files).map((g) => globRegex(`/${g}`));
  const catalog = gitLines(root, 'ls-files', '--cached', '--others', '--exclude-standard').filter((f) => globs.some((g) => g.test(f))).map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
  for (const { file, path, method, op } of operations(root, profile).filter((x) => list(r.verbs).includes(x.method))) {
    const names = list(op[e.marker]);
    if (!names.length) out.push(['EVENT-COVERAGE', file, 'eventsNone', { method: method.toUpperCase(), path, marker: e.marker }]);
    for (const event of names.filter((n) => !new RegExp(`(^|[^\\w.-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w.-]|$)`).test(catalog))) out.push(['EVENT-COVERAGE', file, 'eventsUnknown', { method: method.toUpperCase(), path, event }]);
  }
}

const CHECKS = { stageOrder, sliceContract, longRunning, events };
plug('docChecks', (root, profile) => {
  const m = chosen(root, profile), out = [];
  for (const [type, check] of Object.entries(CHECKS)) for (const r of rulesOf(m, type)) check(root, profile, m, r, out);
  return out.map(([code, path, key, data]) => ({ code, path, key, data: { model: m.name, ...data } }));
});

// The plan's rules: a write bolt has its repeat AC, and each owned table declares its partition and class.
plug('planRules', ({ bundle, units, merged, add, base, profile }) => {
  const m = chosen(base, profile);
  for (const r of rulesOf(m, 'idempotency')) {
    const writes = new RegExp(r.writes, 'i'), repeat = new RegExp(r.repeat, 'i');
    for (const u of units.filter((x) => !merged.has(x.id) && x.fm.status !== config.grid.dropped)) {
      const write = u.acs.find((ac) => writes.test(ac.text));
      if (write && !u.acs.some((ac) => repeat.test(ac.text))) add('IDEMPOTENCY-AC', u, write.line, 'idempotentMissing', {});
    }
  }
  for (const r of rulesOf(m, 'data')) {
    const dir = join(bundle, F.Domain);
    for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.md') && x !== config.okf.index).sort() : []) {
      const doc = parseDoc(readFileSync(join(dir, f), 'utf8')), d = { file: join(dir, f), id: String(doc.fm?.code ?? f.replace(/\.md$/, '')), doc };
      for (const [n] of sectionOf(doc, config.inception.owns)) {
        const line = doc.lines[n - 1], table = line.match(/`([^`]+)`/)?.[1], decl = line.match(/\(partition:\s*[^,)]+,\s*class:\s*([\w-]+)\)/);
        if (!table) continue;
        if (!decl) add('DATA-PARTITION', d, n, 'dataUndeclared', { table });
        else if (!list(r.classes).includes(decl[1])) add('DATA-PARTITION', d, n, 'dataClass', { table, class: decl[1], classes: list(r.classes).join(', ') });
      }
    }
  }
});

// ---- Applying a model (docs/design/models.md#applying-a-model) ----

// The models whose fit words a request's sentences hold, with those sentences, for the intake proposal.
plug('modelFit', (root, sentences) => modelsOf(root).filter((m) => m.data && !m.problems.length).map((m) => ({ name: m.name, title: m.data.title,
  ids: sentences.filter((s) => list(m.data.fit?.words).some((w) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').test(s.text))).map((s) => s.id) })).filter((m) => m.ids.length));

// The increments a model suggests: the walking skeleton through every layer, then each shared domain, then a first slice.
const increments = (d) => [msg('incSkeleton', { layers: d.layers.map((l) => l.id).join(' → ') }), ...(d.domains ?? []).map((x) => msg('incDomain', { id: x.id, role: x.role ?? '' })), msg('incSlice', { declares: list(d.slice?.declares).join(', ') || '-' })]
  .map((text, k) => msg('incLine', { k: k + 1, text })).join('');

function apply(cwd, name) {
  const { profile } = loadProfile(cwd), bundle = bundleOf(cwd, profile), m = name && modelsOf(cwd).find((x) => x.name === name);
  if (!m?.data || m.problems.length) throw new UsageError(msg(name ? 'modelNotApplicable' : 'modelsUsage', { name: name ?? '' }));
  const out = [];
  // The choice, in the project's profile.
  const file = join(cwd, PROFILE), own = readJson(file) ?? {};
  if (own.model?.name !== name) { writeJson(file, { ...own, model: { ...(isMap(own.model) ? own.model : {}), name } }); out.push(msg('applyChosen', { name, file: PROFILE })); }
  // The system doc, when the bundle has none: the template with the model's building blocks.
  const sysDir = join(bundle, F.System), system = existsSync(sysDir) && readdirSync(sysDir).some((f) => f.endsWith('.md') && f !== config.okf.index);
  if (!system) {
    const tpl = [templateFile(cwd, M.systemTemplate), join(PLUGIN_DIR, 'templates', M.systemTemplate)].find(existsSync);
    const blocks = [...m.data.layers, ...(m.data.domains ?? [])].map((x) => `- **${x.id}** (${x.kind ?? '-'}): ${x.role ?? ''}`.trimEnd()).join('\n');
    const text = readFileSync(tpl, 'utf8').replace(/(# Building Block View\n)<[^>\n]*>/, `$1${blocks}`);
    const at = join(sysDir, `${String(profile.naming?.tokens?.system ?? M.systemName)}.md`);
    mkdirSync(sysDir, { recursive: true });
    writeFileSync(at, text);
    out.push(msg('applySystem', { path: relPath(cwd, at) }));
  }
  // The model's decisions, as proposals numbered on, each once.
  const decDir = join(bundle, config.grid.decisions), have = existsSync(decDir) ? readdirSync(decDir).filter((f) => /^\d{4}-/.test(f)) : [];
  const taken = new Set(have.map((f) => parseDoc(readFileSync(join(decDir, f), 'utf8')).fm).filter((fm) => fm?.model === name).map((fm) => String(fm.title).replace(/^\d{4}\s+/, '')));
  let n = Math.max(0, ...have.map((f) => Number(f.slice(0, 4))));
  const src = join(m.dir, M.decisions);
  for (const f of existsSync(src) ? readdirSync(src).filter((x) => x.endsWith('.md')).sort() : []) {
    const text = readFileSync(join(src, f), 'utf8'), title = String(parseDoc(text).fm?.title ?? f).replace(/^\d{4}\s+/, '');
    if (taken.has(title)) continue;
    const num = String(++n).padStart(4, '0'), at = join(decDir, `${num}-${docSlug(title)}.md`);
    mkdirSync(decDir, { recursive: true });
    writeFileSync(at, text.replace(/^title: .*$/m, `title: ${num} ${title}\nmodel: ${name}`));
    out.push(msg('applyDecision', { path: relPath(cwd, at) }));
  }
  return done(out.join('') + msg('applyIncrements', { name }) + increments(m.data));
}

// What a project's modules miss of its chosen model: each item played (modules[].layer), missing, or of another kind.
function gaps(cwd) {
  const { profile } = loadProfile(cwd), m = chosen(cwd, profile);
  if (!m) throw new UsageError(msg('gapsNoModel', { file: PROFILE }));
  const mods = profile.modules ?? [], lines = [], missing = [];
  for (const x of [...m.data.layers, ...(m.data.domains ?? [])]) {
    const by = mods.filter((mod) => mod.layer === x.id);
    if (!by.length) missing.push(x);
    for (const mod of by) lines.push(msg(mod.kind === x.kind ? 'gapPlayed' : 'gapKind', { item: x.id, module: mod.id ?? mod.name, kind: mod.kind ?? '-', want: x.kind ?? '-' }));
  }
  if (!mods.some((mod) => mod.kind === (m.data.slice?.kind ?? 'extension'))) missing.push({ id: M.sliceId, kind: m.data.slice?.kind ?? 'extension', role: list(m.data.slice?.declares).join(', ') });
  const plan = missing.map((x, k) => msg('incLine', { k: k + 1, text: msg('incGap', { id: x.id, kind: x.kind ?? '-', role: x.role ?? '' }) })).join('');
  return done(msg('gapsHead', { name: m.name, played: lines.length, total: m.data.layers.length + (m.data.domains ?? []).length }) + lines.join('') + (missing.length ? msg('gapsMissing', {}) + plan : msg('gapsNone', {})));
}

export const commands = {
  models(args, { cwd }) {
    if (args[0] === 'doc') return modelDoc(cwd, args[1]);
    if (args[0] === 'apply') return apply(cwd, args[1]);
    if (args[0] === 'gaps') return gaps(cwd);
    if (args.length) throw new UsageError(msg('modelsUsage', {}));
    const all = modelsOf(cwd);
    if (!all.length) return done(msg('modelNone', { dir: M.local }));
    return done(all.map((m) => msg('modelLine', { name: m.name, source: m.source, title: m.data?.title ?? '-', problems: m.problems.length ? msg('modelProblems', { count: m.problems.length }) : '' })).join(''));
  },
};
