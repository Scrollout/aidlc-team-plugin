// Architecture models: a proven system's vertical and horizontal shape as data, kept by the project that uses it
// (docs/design/models.md, decisions 0020 and 0025).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { bundleOf, CLI_DIR, config, docSlug, done, gitLines, globRegex, isMap, list, loadProfile, msg, nameOf, parseDoc, parseYaml, plug, readJson, registry, relPath, render, seam, sectionOf, templateFile, UsageError, writeJson } from '../../lib/index.mjs';

const M = config.models, F = config.okf.bundle.folders, SL = config.slices;
const sha16 = (text) => createHash('sha256').update(text).digest('hex').slice(0, config.text.digest);
const folders = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory()).sort() : []);

// Every model the project can see, by name: the plugin ships none, so they are the project's or its organisation's,
// kept in its models folder (decision 0025).
function modelsOf(root) {
  const dir = join(root, config.packages.models.override), verbs = verbsOf(root);
  return folders(dir).map((name) => ({ name, source: 'project', dir: join(dir, name) })).map((m) => ({ ...m, ...read(m, verbs) }));
}
// The verbs a slice may take: the naming registry's, with the project's own (docs/design/naming.md).
const verbsOf = (root) => { try { return registry(loadProfile(root).profile).vocabularies.verb; } catch { return config.naming.vocabularies.verb; } };

// A model domain's slices, each with the name the registry composes from its verb and the domain's noun; the model's
// domains count as registered, since `models apply` writes their docs (docs/design/vertical-slices.md#planned-before-built).
const slicesOf = (x) => (Array.isArray(x?.slices) ? x.slices : []);
const named = (reg, ids) => ({ ...reg, domains: { ...Object.fromEntries(ids.map((id) => [id, {}])), ...reg.domains } });
const sliceNames = (x, reg) => slicesOf(x).map((s) => ({ ...s, domain: x.id, name: nameOf(M.sliceKind, { domain: x.id, verb: s.verb }, reg), decl: declOf(s) }));
// A model slice's declaration as its # Surface line carries it, or '' when it declares no cuts (docs/design/slice-method.md#one-grammar).
function declOf(s) {
  const D = SL.declaration, joined = (v) => list(v).join(`${D.list} `);
  if (!list(s?.cuts).length) return '';
  const parts = D.parts.filter((p) => s[p] !== undefined && s[p] !== false).map((p) => (D.flags.includes(p) ? p : msg('modelDeclPart', { part: p, value: joined(s[p]) })));
  return msg('modelDecl', { cuts: joined(s.cuts), parts });
}

function read(m, verbs) {
  const file = join(m.dir, M.file);
  if (!existsSync(file)) return { problems: [['modelNoFile', { model: m.name, file: M.file }]] };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return { data, problems: problems(m, data, verbs) };
  } catch (e) {
    return { problems: [['modelUnreadable', { model: m.name, error: e.message }]] };
  }
}

// What breaks the format: missing keys, lists that are not, ids missing or twice, unknown kinds, rule types and
// contract ends, and decisions that are not Decision docs.
// A model slice's declaration: cuts a stack pack lists, known keys, an entry that is a runtime layer, calls to a domain,
// the extension or an adapter layer (docs/design/slice-method.md#one-grammar).
function declProblems(s, x, d, add) {
  const D = SL.declaration, at = { id: x.id, kind: s?.kind ?? '-', verb: s?.verb ?? '-' }, keys = [...M.sliceKeys, ...D.parts], layers = d.layers ?? [];
  for (const key of Object.keys(s ?? {}).filter((k) => !keys.includes(k))) add('modelSliceKey', { ...at, key, keys: keys.join(', ') });
  if (!list(s?.cuts).length) { if (D.parts.some((p) => s?.[p] !== undefined)) add('modelSliceNoCuts', at); return; }
  const cuts = seam('sliceDeclaration').flatMap((x) => x.cuts());
  for (const cut of cuts.length ? list(s.cuts).filter((c) => !cuts.includes(c)) : []) add('modelSliceUnknownCut', { ...at, cut, cuts: cuts.join(', ') });
  if (s.entry !== undefined && !layers.some((l) => l.id === s.entry && l.kind === D.runtime)) add('modelSliceEntry', { ...at, entry: s.entry });
  const callable = [...(d.domains ?? []).map((y) => y.id), M.extensionId, ...layers.filter((l) => l.kind === M.adapterKind).map((l) => l.id)];
  for (const target of list(s.calls).filter((t) => !callable.includes(t))) add('modelSliceCall', { ...at, target });
}

function problems(m, d, verbs) {
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
  // Each domain's and the extension's slices: a kind the slice checks know, a verb of the registry, a use case, and a
  // kind and verb once per domain.
  for (const x of [...(Array.isArray(d.domains) ? d.domains : []), { ...(d.extension ?? {}), id: M.extensionId }]) {
    if (x.slices !== undefined && !Array.isArray(x.slices)) add('modelList', { key: `${x.id}.${M.slicesKey}` });
    const seen = new Set();
    for (const s of slicesOf(x)) {
      if (!SL.kinds.includes(s?.kind)) add('modelSliceKind', { id: x.id, kind: s?.kind ?? '-', kinds: SL.kinds.join(', ') });
      if (!list(verbs).includes(s?.verb)) add('modelSliceVerb', { id: x.id, verb: s?.verb ?? '-', verbs: list(verbs).join(', ') });
      if (!String(s?.useCase ?? '').trim()) add('modelSliceUseCase', { id: x.id, verb: s?.verb ?? '-' });
      if (seen.has(`${s?.kind} ${s?.verb}`)) add('modelSliceTwice', { id: x.id, kind: s?.kind ?? '-', verb: s?.verb ?? '-' });
      seen.add(`${s?.kind} ${s?.verb}`);
      declProblems(s, x, d, add);
    }
  }
  // What a runtime applies to every slice it serves: a pipeline layer of the model, or an outcome kind (docs/design/slice-declares.md).
  for (const l of (Array.isArray(d.layers) ? d.layers : []).filter((y) => y?.applies !== undefined)) {
    const stages = (d.layers ?? []).filter((y) => y?.kind === M.pipelineKind).map((y) => y.id);
    for (const item of list(l.applies).filter((i) => !stages.includes(i) && !M.appliesKinds.includes(i))) add('modelApplies', { id: l.id, item, kinds: M.appliesKinds.join(', ') });
  }
  for (const r of Array.isArray(d.rules) ? d.rules : []) if (!M.ruleTypes.includes(r?.type)) add('modelRule', { type: r?.type ?? '-', types: M.ruleTypes.join(', ') });
  for (const c of Array.isArray(d.contracts) ? d.contracts : []) for (const end of ['from', 'to']) if (c?.[end] !== undefined && !ids.has(c[end]) && c[end] !== M.extensionId) add('modelContract', { end, id: c[end] });
  const dir = join(m.dir, M.decisions);
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(config.okf.ext)).sort() : []) {
    if (parseDoc(readFileSync(join(dir, f), 'utf8')).fm?.type !== config.grid.decisionType) add('modelDecision', { file: f });
  }
  return out;
}

// A project model by name, and the research digests a list names (files under research/), with their sources.
const project = (root, name) => modelsOf(root).find((m) => m.name === name && m.source === 'project');
const digests = (bundle, names) => list(names).map((n) => join(bundle, M.research, `${n}${config.okf.ext}`)).filter(existsSync).map((f) => parseDoc(readFileSync(f, 'utf8')).fm?.sources ?? []);
// A model's items that carry sources: its layers, its domains, and its rules by id or type.
const items = (d) => [...(d.layers ?? []), ...(d.domains ?? []), ...(d.rules ?? []).map((r) => ({ ...r, id: r.id ?? r.type }))];

// The Model doc the owner approves, drawn from model.json with its sources as footnotes (docs/design/models.md#modelling-a-reference).
function modelDoc(cwd, name) {
  const { profile } = loadProfile(cwd), bundle = bundleOf(cwd, profile), m = name && project(cwd, name);
  if (!m?.data) throw new UsageError(msg(name ? 'modelUnknown' : 'modelsUsage', { name, dir: config.packages.models.override }));
  const d = m.data, H = M.docHeadings, sources = new Map(digests(bundle, d.research).flat().map((s) => [String(s.id), s]));
  const cite = (x) => list(x.sources).map((s) => `[^${s}]`).join('');
  const line = (x) => `- **${x.id}** (${x.kind ?? '-'}): ${x.role ?? ''} ${cite(x)}`.trimEnd();
  const used = [...new Set(items(d).flatMap((x) => list(x.sources)))].filter((s) => sources.has(s));
  const body = ['', `# ${H.layers}`, ...d.layers.map(line), '', `# ${H.domains}`, ...(d.domains ?? []).map(line), '', `# ${H.extension}`, ...Object.entries(d.extension ?? {}).map(([k, v]) => `- ${k}: ${[v].flat().join(', ')}`),
    '', `# ${H.contracts}`, ...(d.contracts ?? []).map((c) => `- ${c.from} → ${c.to}${c.via ? msg('modelVia', c) : ''}`), '', `# ${H.rules}`, ...(d.rules ?? []).map((r) => `- ${r.id ?? r.type}: ${r.type} ${cite(r)}`.trimEnd()),
    ...(used.length ? ['', `# ${H.sources}`, ...used.map((s) => `[^${s}]: ${sources.get(s).title ?? s}, ${sources.get(s).resource ?? ''}`.trimEnd())] : [])].join('\n') + '\n';
  const dir = join(bundle, F.Model), file = join(dir, `${name}${config.okf.ext}`), at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, msg('modelDoc', { title: JSON.stringify(d.title), description: JSON.stringify(d.description), name, research: list(d.research).join(', '), digest: sha16(readFileSync(join(m.dir, M.file), 'utf8')),
    producer: msg('producer', { version: readJson(join(CLI_DIR, config.map.manifest))?.version ?? config.init.devVersion }), at, bodyDigest: sha16(body), body }));
  return done(msg('modelDocWrote', { path: relPath(cwd, file), file: relPath(cwd, join(m.dir, M.file)) }));
}

// The model pathway's steps: its research digests filed, and a current Model doc of a model in the format.
plug('pathwaySteps', (i, { bundle, base }) => ({
  research: () => list(i.fm.research).length > 0 && list(i.fm.research).every((n) => existsSync(join(bundle, M.research, `${n}${config.okf.ext}`))),
  modelDoc: () => {
    const name = String(i.fm.model ?? ''), m = name && project(base, name), file = join(bundle, F.Model, `${name}${config.okf.ext}`);
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

function extensionContract(root, profile, m, r, out) {
  for (const mod of (profile.modules ?? []).filter((x) => x.kind === r.kind)) {
    const missing = list(r.declares).filter((k) => !isMap(mod.declares) || mod.declares[k] === undefined || mod.declares[k] === '');
    if (missing.length) out.push(['PROVIDER-CONTRACT', PROFILE, 'declaresMissing', { module: mod.id ?? mod.name, kind: r.kind, fields: missing.join(', ') }]);
  }
}

function longRunning(root, profile, m, r, out) {
  const o = { ...M.defaults.operations, ...profile.model.operations }, roles = M.lro.roles.filter((k) => !o[k]);
  if (roles.length) return out.push(['LONG-RUNNING', PROFILE, 'lroNoNames', { roles: roles.join(', ') }]);
  const shapes = list(r.shapes).length ? r.shapes : [];
  const fits = (responses, s) => isMap(responses[String(s.code)]) && [...list(s.links), ...M.lro.always].every((l) => has(responses[String(s.code)].headers, o[l]));
  for (const { file, path, method, op } of operations(root, profile)) {
    const responses = isMap(op.responses) ? op.responses : {};
    if (op[o.marker] === true && !shapes.some((s) => fits(responses, s))) out.push(['LONG-RUNNING', file, 'lroShape', { method: method.toUpperCase(), path, shapes: shapes.map((s) => msg('lroShapeItem', { code: s.code, headers: [...list(s.links), ...M.lro.always].map((l) => o[l]).join(M.lro.join.headers) })).join(M.lro.join.shapes) }]);
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

const CHECKS = { stageOrder, extensionContract, longRunning, events };
// The chosen model's contract, which the contracts check adds to the generic grammar (decision 0021).
plug('modelContract', (root, profile) => chosen(root, profile)?.data.contract ?? null);
plug('modelLayers', (root, profile) => chosen(root, profile)?.data.layers ?? null);
plug('docChecks', (root, profile) => {
  const m = chosen(root, profile), out = [];
  for (const [type, check] of Object.entries(CHECKS)) for (const r of rulesOf(m, type)) check(root, profile, m, r, out);
  return out.map(([code, path, key, data]) => ({ code, path, key, data: { model: m.name, ...data } }));
});

// The plan's rules: a write bolt has its repeat AC, and each owned table declares its partition and class.
function idempotency({ units, merged, add }, r) {
  const writes = new RegExp(r.writes, 'i'), repeat = new RegExp(r.repeat, 'i');
  for (const u of units.filter((x) => !merged.has(x.id) && x.fm.status !== config.grid.dropped)) {
    const write = u.acs.find((ac) => writes.test(ac.text));
    if (write && !u.acs.some((ac) => repeat.test(ac.text))) add('IDEMPOTENCY-AC', u, write.line, 'idempotentMissing', {});
  }
}
function data({ bundle, add }, r) {
  const dir = join(bundle, F.Domain);
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(config.okf.ext) && x !== config.okf.index).sort() : []) {
    const doc = parseDoc(readFileSync(join(dir, f), 'utf8')), d = { file: join(dir, f), id: String(doc.fm?.code ?? basename(f, config.okf.ext)), doc };
    for (const [n] of sectionOf(doc, config.inception.owns)) {
      const line = doc.lines[n - 1], table = line.match(/`([^`]+)`/)?.[1], decl = line.match(new RegExp(M.partitionLine));
      if (!table) continue;
      if (!decl) add('DATA-PARTITION', d, n, 'dataUndeclared', { table });
      else if (!list(r.classes).includes(decl[1])) add('DATA-PARTITION', d, n, 'dataClass', { table, class: decl[1], classes: list(r.classes).join(', ') });
    }
  }
}
const PLAN = { idempotency, data };
plug('planRules', (ctx) => {
  const m = chosen(ctx.base, ctx.profile);
  for (const [type, check] of Object.entries(PLAN)) for (const r of rulesOf(m, type)) check(ctx, r);
});

// ---- Applying a model (docs/design/models.md#applying-a-model) ----

// The models whose fit words a request's sentences hold, with those sentences, for the intake proposal.
// With each model's slices, as the registry names them, so stories are written per use case.
plug('modelFit', (root, sentences) => modelsOf(root).filter((m) => m.data && !m.problems.length).map((m) => ({ name: m.name, title: m.data.title,
  slices: (m.data.domains ?? []).flatMap((x) => sliceNames(x, named(registry(loadProfile(root).profile), (m.data.domains ?? []).map((y) => y.id)))),
  ids: sentences.filter((s) => list(m.data.fit?.words).some((w) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').test(s.text))).map((s) => s.id) })).filter((m) => m.ids.length));

// The increments a model suggests, slice by slice: the walking skeleton through every layer serving the first slice,
// then each further slice of each shared domain (a domain with none as one increment), then a first extension.
function increments(d, reg) {
  const shared = (d.domains ?? []).map((x) => ({ x, slices: sliceNames(x, reg) })), all = shared.flatMap((s) => s.slices), first = all.find((s) => list(s.cuts).length === Math.max(0, ...all.map((y) => list(y.cuts).length)));
  return [msg('incSkeleton', { layers: d.layers.map((l) => l.id).join(' → '), first: first ? [first] : [] }),
    ...shared.flatMap(({ x, slices }) => (slices.length ? slices.filter((s) => s !== first).map((s) => msg('incSlice', s)) : [msg('incDomain', { id: x.id, role: x.role ?? '' })])),
    msg('incExtension', { declares: list(d.extension?.declares).join(', ') || '-', slices: slicesOf(d.extension) })]
    .map((text, k) => msg('incLine', { k: k + 1, text })).join('');
}

// A model domain's doc, when the bundle has none: the template, its # Surface one line per slice with its use case,
// the stories left for elaboration to cite.
function domainDocs(cwd, bundle, d, reg, out) {
  const dir = join(bundle, F.Domain), tpl = readFileSync(templateFile(cwd, M.domainTemplate), 'utf8');
  const surface = new RegExp(render(M.surfaceSection, { heading: SL.surface }), 'm'), slice = new RegExp(render(M.surfaceSlice, { kinds: SL.kinds.join('|') }));
  for (const x of (d.domains ?? []).filter((y) => !Object.keys(registry({}, bundle).domains).includes(y.id))) {
    const lines = sliceNames(x, reg).map((s) => msg('modelSurfaceLine', s)).join('');
    const text = tpl.replace(new RegExp(M.fm.title, 'm'), msg('modelDomainTitle', x)).replace(new RegExp(M.fm.description, 'm'), msg('modelDomainDescription', { role: JSON.stringify(x.role ?? x.id) }))
      .replace(new RegExp(M.fm.code, 'm'), msg('modelDomainCode', x)).replace(surface, (all, head, body) => `${head}${lines}${body.split('\n').filter((l) => l && !slice.test(l)).map((l) => `${l}\n`).join('')}\n`);
    const at = join(dir, `${x.id}${config.okf.ext}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(at, text);
    out.push(msg('applyDomain', { path: relPath(cwd, at), count: slicesOf(x).length }));
  }
}

function apply(cwd, name) {
  const { profile } = loadProfile(cwd), bundle = bundleOf(cwd, profile), m = name && modelsOf(cwd).find((x) => x.name === name);
  if (!m?.data || m.problems.length) throw new UsageError(msg(name ? 'modelNotApplicable' : 'modelsUsage', { name: name ?? '' }));
  const out = [];
  // The choice, in the project's profile.
  const file = join(cwd, PROFILE), own = readJson(file) ?? {};
  if (own.model?.name !== name) { writeJson(file, { ...own, model: { ...(isMap(own.model) ? own.model : {}), name } }); out.push(msg('applyChosen', { name, file: PROFILE })); }
  // The names its API contract shapes, such as its path, over the plugin's generic grammar (decision 0021).
  const grammar = isMap(m.data.contract?.grammar) ? m.data.contract.grammar : null, now = readJson(file);
  if (grammar && JSON.stringify(now.naming?.grammar ?? {}) !== JSON.stringify({ ...(now.naming?.grammar ?? {}), ...grammar })) { writeJson(file, { ...now, naming: { ...(isMap(now.naming) ? now.naming : {}), grammar: { ...(now.naming?.grammar ?? {}), ...grammar } } }); out.push(msg('applyGrammar', { kinds: Object.keys(grammar).join(', '), file: PROFILE })); }
  // The system doc, when the bundle has none: the template with the model's building blocks.
  const sysDir = join(bundle, F.System), system = existsSync(sysDir) && readdirSync(sysDir).some((f) => f.endsWith(config.okf.ext) && f !== config.okf.index);
  if (!system) {
    const tpl = [templateFile(cwd, M.systemTemplate)].find(existsSync);
    const blocks = [...m.data.layers, ...(m.data.domains ?? [])].map((x) => `- **${x.id}** (${x.kind ?? '-'}): ${x.role ?? ''}`.trimEnd()).join('\n');
    const text = readFileSync(tpl, 'utf8').replace(new RegExp(M.systemBlocks), `$1${blocks}`);
    const at = join(sysDir, `${String(profile.naming?.tokens?.system ?? M.systemName)}${config.okf.ext}`);
    mkdirSync(sysDir, { recursive: true });
    writeFileSync(at, text);
    out.push(msg('applySystem', { path: relPath(cwd, at) }));
  }
  // The model's decisions, as proposals numbered on, each once.
  const decDir = join(bundle, config.grid.decisions), have = existsSync(decDir) ? readdirSync(decDir).filter((f) => /^\d{4}-/.test(f)) : [];
  const taken = new Set(have.map((f) => parseDoc(readFileSync(join(decDir, f), 'utf8')).fm).filter((fm) => fm?.model === name).map((fm) => String(fm.title).replace(/^\d{4}\s+/, '')));
  let n = Math.max(0, ...have.map((f) => Number(f.slice(0, config.ids.decisionDigits))));
  const src = join(m.dir, M.decisions);
  for (const f of existsSync(src) ? readdirSync(src).filter((x) => x.endsWith(config.okf.ext)).sort() : []) {
    const text = readFileSync(join(src, f), 'utf8'), title = String(parseDoc(text).fm?.title ?? f).replace(/^\d{4}\s+/, '');
    if (taken.has(title)) continue;
    const num = String(++n).padStart(config.ids.decisionDigits, '0'), at = join(decDir, `${num}-${docSlug(title)}${config.okf.ext}`);
    mkdirSync(decDir, { recursive: true });
    writeFileSync(at, text.replace(/^title: .*$/m, `title: ${num} ${title}\nmodel: ${name}\ndate: ${new Date().toISOString().split('T')[0]}`)); // MADR's date: when it was last changed
    out.push(msg('applyDecision', { path: relPath(cwd, at) }));
  }
  const reg = named(registry(profile, bundle), (m.data.domains ?? []).map((x) => x.id));
  domainDocs(cwd, bundle, m.data, reg, out);
  return done(out.join('') + msg('applyIncrements', { name }) + increments(m.data, reg));
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
  // A played domain's slices its doc does not list (docs/design/vertical-slices.md#planned-before-built).
  const bundle = bundleOf(cwd, profile), reg = registry(profile, bundle), line = new RegExp(render(M.surfaceLine, { kinds: SL.kinds.join('|'), name: SL.name }));
  const listed = (code) => { const file = join(bundle, F.Domain, `${code}${config.okf.ext}`), doc = existsSync(file) && parseDoc(readFileSync(file, 'utf8')); return new Map(doc ? sectionOf(doc, SL.surface).map(([n]) => [doc.lines[n - 1].match(line)?.[1], doc.lines[n - 1].split(':')[0]]).filter(([k]) => k) : []); };
  const parse = seam('sliceDeclaration')[0]?.parse ?? (() => null), lacks = (s, head) => { const got = parse(head) ?? { cuts: [] }; return ['cuts', ...SL.declaration.parts].filter((p) => list(s[p]).some((v) => !list(got[p]).includes(v)) || (s[p] === true && got[p] !== true)); };
  const slices = (m.data.domains ?? []).flatMap((x) => mods.filter((mod) => mod.layer === x.id).flatMap((mod) => { const code = String(mod.id ?? mod.name), have = listed(code); return sliceNames({ ...x, id: code }, named(reg, [code])).filter((s) => !have.has(s.name) || lacks(s, have.get(s.name)).length).map((s) => ({ ...s, lacks: have.has(s.name) ? lacks(s, have.get(s.name)) : [] })); }));
  if (!mods.some((mod) => mod.kind === (m.data.extension?.kind ?? 'extension'))) missing.push({ id: M.extensionId, kind: m.data.extension?.kind ?? 'extension', role: list(m.data.extension?.declares).join(', ') });
  const plan = [...missing.map((x) => msg('incGap', { id: x.id, kind: x.kind ?? '-', role: x.role ?? '' })), ...slices.map((s) => msg(s.lacks.length ? 'incSliceGap' : 'incSlice', { ...s, parts: s.lacks.join(', ') }))].map((text, k) => msg('incLine', { k: k + 1, text })).join('');
  return done(msg('gapsHead', { name: m.name, played: lines.length, total: m.data.layers.length + (m.data.domains ?? []).length }) + lines.join('') + (missing.length || slices.length ? msg('gapsMissing', {}) + plan : msg('gapsNone', {})));
}

export const commands = {
  models(args, { cwd }) {
    if (args[0] === 'doc') return modelDoc(cwd, args[1]);
    if (args[0] === 'apply') return apply(cwd, args[1]);
    if (args[0] === 'gaps') return gaps(cwd);
    if (args.length) throw new UsageError(msg('modelsUsage', {}));
    const all = modelsOf(cwd);
    if (!all.length) return done(msg('modelNone', { dir: config.packages.models.override }));
    const models = all.map((m) => ({ name: m.name, source: m.source, title: m.data?.title ?? '-', problems: m.problems.length }));
    return done(models.map((m) => msg('modelLine', { ...m, problems: m.problems ? msg('modelProblems', { count: m.problems }) : '' })).join(''), config.exit.ok, [], { models });
  },
};
