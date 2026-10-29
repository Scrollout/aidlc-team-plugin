// M24: architecture models as data (docs/design/models.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { config } from '../plugin/cli/lib/index.mjs';
import { CHILD_ENV, commit, I1, makeRepo, pinnedRepo, read, run, write } from './state-repo.mjs';

const model = (name, extra = {}) => ({
  name, title: `${name} shape`, description: 'A minimal shape.',
  layers: [{ id: 'gate', kind: 'pipeline', role: 'checks each request' }], domains: [{ id: 'records', kind: 'domain', role: 'what exists' }],
  extension: { declares: ['namespace'] }, contracts: [{ from: 'gate', to: 'extension', via: 'http' }], rules: [{ type: 'stageOrder', stages: ['gate'] }], ...extra,
});
const decision = '---\ntype: Decision\ntitle: 0001 One gate\ndescription: d.\n---\n\n# Context and Problem Statement\nx\n';
const formatLines = (dir) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => /MODEL-FORMAT/.test(l)).map((l) => l.replace(/ → .*$/, ''));
// The project's pinned CLI.
const pinnedRun = (dir, args) => spawnSync(process.execPath, [join(dir, '.aidlc/bin/aidlc.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: CHILD_ENV }).stdout;

test('B228/AC-1 a model folder loads from the project, the plugin shipping none (decision 0025), and check reports one that breaks the format', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' });
  assert.match(run(dir, ['models']).out, /^no architecture models: none ships with this CLI/);
  write(dir, { '.aidlc/models/minimal/model.json': model('minimal'), '.aidlc/models/minimal/decisions/0001-one-gate.md': decision });
  assert.equal(run(dir, ['models']).out, 'minimal (project): minimal shape\n');
  assert.deepEqual(formatLines(dir), [], 'a model in the format');

  const broken = model('other', { extension: undefined, layers: [{ id: 'gate', kind: 'hub' }, { id: 'gate', kind: 'pipeline' }], rules: [{ type: 'magic' }], contracts: [{ from: 'gate', to: 'nowhere' }] });
  write(dir, { '.aidlc/models/broken/model.json': broken, '.aidlc/models/broken/decisions/notes.md': '# notes\n', '.aidlc/models/empty/README.md': 'x' });
  assert.match(run(dir, ['models']).out, /^broken \(project\): other shape, 7 format problems: aidlc check$/m);
  const lines = formatLines(dir).join('\n');
  for (const want of ['architecture model broken lacks extension', 'architecture model broken is named other inside', 'architecture model broken: gate has kind hub', 'architecture model broken: gate is named twice', 'architecture model broken: rule type magic is not one of stageOrder', "architecture model broken: an API contract's to is nowhere", 'architecture model broken: decisions/notes.md is not a Decision doc', 'model empty has no model.json']) {
    assert.ok(lines.includes(want), want);
  }

  const pinned = pinnedRepo();
  write(pinned, { '.aidlc/bin/models/second/model.json': model('second'), '.aidlc/models/minimal/model.json': model('minimal', { title: 'project shape' }) });
  assert.equal(pinnedRun(pinned, ['models']), 'minimal (project): project shape\n', 'the pinned CLI reads the project\'s models only');
});

const V2 = { system: { core: ['src/**'] }, naming: { tokens: { system: 'bak' } } };
const research = '---\ntype: Research\ntitle: Reference control plane\ndescription: How a proven control plane is shaped.\nquestion: "what is its shape?"\ngenerated: { by: claude-code/x, at: 2026-10-27T00:00:00Z }\nsources:\n  - id: s1\n    resource: https://example.org/gate\n    title: The gate\n  - id: s2\n    resource: https://example.org/records\n    title: The records\n---\n\n# Options\nx\n';
const intent = (fm) => `---\ntype: Intent\ntitle: Model the reference\ndescription: A model of the reference.\npathway: model\nmodel: minimal\nmethod: 5\n${fm}---\n\n# Goal\nx\n`;
const findings = (dir, code) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => l.includes(code)).map((l) => l.replace(/ → .*$/, '').replace(/^docs\/intents\/I-1-model-the-reference\.md:\d+ /, ''));

test('B229/AC-1 a model pathway intent needs its research digests and a current Model doc, which the owner approves', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  write(dir, { 'docs/intents/I-1-model-the-reference.md': intent('research: [reference]\n') });
  assert.deepEqual(findings(dir, 'PATHWAY-SKIP'), [
    'PATHWAY-SKIP I-1 (model) skips its research step: a Research digest under research/ for each name in research:',
    'PATHWAY-SKIP I-1 (model) skips its modelDoc step: a current Model doc for model: (aidlc models doc <name>), its model in the format',
  ]);
  const sourced = model('minimal', { research: ['reference'], layers: [{ id: 'gate', kind: 'pipeline', role: 'checks each request', sources: ['s1'] }], domains: [{ id: 'records', kind: 'domain', role: 'what exists', sources: ['s2'] }], rules: [{ type: 'stageOrder', stages: ['gate'], sources: ['s1'] }] });
  write(dir, { 'docs/research/reference.md': research, '.aidlc/models/minimal/model.json': sourced });
  assert.match(run(dir, ['models', 'doc', 'minimal']).out, /^wrote docs\/models\/minimal\.md from \.aidlc\/models\/minimal\/model\.json: ask the owner to approve it \(aidlc approve docs\/models\/minimal\.md\)/);
  const doc = read(dir, 'docs/models/minimal.md');
  assert.match(doc, /^type: Model\n[\s\S]*^model: minimal\nresearch: \[reference\]\ndigest: [0-9a-f]{16}$/m);
  assert.match(doc, /\n# Layers\n- \*\*gate\*\* \(pipeline\): checks each request \[\^s1\]\n/);
  assert.match(doc, /\n# Sources\n\[\^s1\]: The gate, https:\/\/example\.org\/gate\n\[\^s2\]: The records, https:\/\/example\.org\/records\n$/);
  assert.deepEqual(findings(dir, 'PATHWAY-SKIP'), [], 'research filed, the Model doc current');
  assert.deepEqual(findings(dir, 'DOC-'), [], 'the CLI wrote it');
  write(dir, { '.aidlc/models/minimal/model.json': { ...sourced, title: 'changed shape' } });
  assert.match(findings(dir, 'PATHWAY-SKIP').join('\n'), /skips its modelDoc step/, 'a model changed since its doc');
  run(dir, ['models', 'doc', 'minimal']);
  commit(dir, 'model');
  assert.equal(run(dir, ['approve', 'docs/models/minimal.md']).code, 0, 'the owner approves the Model doc');
  assert.match(read(dir, 'docs/models/minimal.md'), /^verified_hash: /m);
  assert.match(run(dir, ['models', 'doc', 'nothere']).err, /no project architecture model nothere in \.aidlc\/models/);
});

test('B229/AC-2 each layer, domain and rule of a project model cites a source of its research (MODEL-SOURCE)', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  write(dir, { 'docs/intents/I-1-model-the-reference.md': intent('research: [reference]\n'), 'docs/research/reference.md': research,
    '.aidlc/models/minimal/model.json': model('minimal', { layers: [{ id: 'gate', kind: 'pipeline', sources: ['s1'] }], domains: [{ id: 'records', kind: 'domain' }], rules: [{ type: 'stageOrder', sources: ['s9'] }] }) });
  assert.deepEqual(findings(dir, 'MODEL-SOURCE'), [
    'MODEL-SOURCE I-1 architecture model minimal: records cites no source',
    'MODEL-SOURCE I-1 architecture model minimal: stageOrder cites s9, no source of reference',
  ]);
});

// A model with each rule type, and a project that chose it, with the names only it knows in its profile.
const RULES = [
  { type: 'stageOrder', stages: ['authenticate', 'authorize', 'policy'] },
  { type: 'extensionDeclaration', kind: 'extension', declares: ['namespace', 'types'] },
  { type: 'longRunning', shapes: [{ code: 201, links: ['status'] }, { code: 202, links: ['result'] }], deleteAbsent: 204 },
  { type: 'idempotency', writes: '\\b(creates?|updates?)\\b', repeat: '\\b(again|repeated)\\b.*\\bunchanged\\b' },
  { type: 'data', classes: ['regional', 'shared', 'global'] },
  { type: 'events', verbs: ['put', 'patch', 'post', 'delete'] },
];
const chosen = (declares) => ({ ...V2, model: { name: 'minimal', wiring: { file: 'src/gate/stages.txt', pattern: 'Stage(\\w+)' }, operations: { status: 'Op-Status', result: 'Op-Result', retry: 'Retry-After' }, events: { files: ['api/events/*.yaml'] } },
  modules: [{ id: 'gate', kind: 'pipeline', paths: ['src/gate/**'] }, { id: 'things', kind: 'extension', paths: ['src/things/**'], declares }] });
const api = (put, del) => `openapi: 3.1.0\ninfo: { title: t, version: 2026-10-01 }\npaths:\n  /things/{thingName}:\n    put:\n${put}\n    delete:\n${del}\n`;
const ruleLines = (dir) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => /PIPELINE-ORDER|EXTENSION-DECLARATION|LONG-RUNNING|IDEMPOTENCY-AC|DATA-PARTITION|EVENT-COVERAGE/.test(l)).map((l) => l.replace(/ → .*$/, '')).join('\n');

test('B230/AC-1 B230/AC-2 only the chosen model\'s rules run, each reporting what breaks it, with the project\'s own names', () => {
  const broken = {
    '.aidlc/models/minimal/model.json': model('minimal', { rules: RULES }),
    'src/gate/stages.txt': 'StageAuthenticate\nStagePolicy\nStageAuthorize\n',
    'api/things/openapi.yaml': api('      x-long-running: true\n      x-events: [things.written]\n      responses:\n        "201":\n          headers:\n            Op-Status: { schema: { type: string } }', '      responses:\n        "202": { description: accepted }'),
    'api/events/things.yaml': 'events:\n  - things.deleted\n',
    'docs/domains/things.md': '---\ntype: Domain\ntitle: things\ndescription: things.\ncode: things\nkind: domain\n---\n\n# Owns\n- `things.rows`: the things\n- `things.log` (partition: thingName, class: secret): changes\n',
    'docs/bolts/B-1-put-a-thing.md': '---\ntype: Bolt\ntitle: Put a thing\ndescription: Put a thing.\nscope: ["src/things/**"]\n---\n\n- AC-1 (unit): Given no thing, when a client creates one, then it is stored.\n',
  };
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n', ...broken }, chosen({ namespace: 'Acme.Things' }));
  const lines = ruleLines(dir);
  for (const want of [
    'src/gate/stages.txt:1 PIPELINE-ORDER architecture model minimal: the stages come as authenticate, policy, authorize, not in the architecture model\'s order authenticate, authorize, policy',
    '.aidlc/profile.json:1 EXTENSION-DECLARATION architecture model minimal: module things (extension) declares no types under `declares`',
    'api/things/openapi.yaml:1 LONG-RUNNING architecture model minimal: PUT /things/{thingName} is flagged long-running but answers none of 201 with Op-Status and Retry-After, or 202 with Op-Result and Retry-After',
    'api/things/openapi.yaml:1 LONG-RUNNING architecture model minimal: DELETE /things/{thingName} declares no 204 answer for an absent resource',
    'api/things/openapi.yaml:1 EVENT-COVERAGE architecture model minimal: PUT /things/{thingName} emits things.written, which no integration events file defines',
    'api/things/openapi.yaml:1 EVENT-COVERAGE architecture model minimal: DELETE /things/{thingName} names no integration events under x-events',
    "docs/bolts/B-1-put-a-thing.md:8 IDEMPOTENCY-AC B-1 has a write AC but none that repeats it and finds status and state unchanged",
    'docs/domains/things.md:10 DATA-PARTITION things owns things.rows with no (partition: <key>, class: <class>)',
    'docs/domains/things.md:11 DATA-PARTITION things gives things.log class secret, not one of regional, shared, global',
  ]) assert.ok(lines.includes(want), `${want}\n--- got:\n${lines}`);

  write(dir, {
    'src/gate/stages.txt': 'StageAuthenticate\nStageAuthorize\nStagePolicy\n',
    'api/things/openapi.yaml': api('      x-long-running: true\n      x-events: [things.written]\n      responses:\n        "201":\n          headers:\n            Op-Status: { schema: { type: string } }\n            Retry-After: { schema: { type: integer } }', '      x-events: [things.deleted]\n      responses:\n        "202": { description: accepted }\n        "204": { description: absent }'),
    'api/events/things.yaml': 'events:\n  - things.written\n  - things.deleted\n',
    'docs/domains/things.md': broken['docs/domains/things.md'].replace('- `things.rows`: the things', '- `things.rows` (partition: thingName, class: regional): the things').replace('class: secret', 'class: shared'),
    'docs/bolts/B-1-put-a-thing.md': broken['docs/bolts/B-1-put-a-thing.md'] + '- AC-2 (unit): Given a stored thing, when the same put is repeated, then its status and state are unchanged.\n',
    '.aidlc/profile.json': chosen({ namespace: 'Acme.Things', types: ['widgets'] }),
  });
  assert.equal(ruleLines(dir), '', 'every rule met');
  write(dir, { ...broken, '.aidlc/profile.json': { ...chosen({}), model: undefined } });
  assert.equal(ruleLines(dir), '', 'no chosen model, no rule runs');
});

test('B231/AC-1 intake lists the models that fit the request; apply records the choice, writes the system doc, copies the decisions once and prints increments', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n', 'docs/decisions/0003-earlier.md': '---\ntype: Decision\ntitle: 0003 Earlier\ndescription: d.\n---\n' }, V2);
  write(dir, { '.aidlc/models/minimal/model.json': model('minimal', { fit: { words: ['gate', 'records'] } }), '.aidlc/models/minimal/decisions/0001-one-gate.md': decision });
  assert.match(run(dir, ['intake', 'Every request passes the gate. The records keep what exists. Nothing else.']).out, /\n  architecture models that fit: minimal \(Q-1\.1, Q-1\.2\); once the owner picks one: aidlc models apply <name>\n/);
  const r = run(dir, ['models', 'apply', 'minimal']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, [
    'chose minimal in .aidlc/profile.json',
    'wrote docs/system/bak.md: its building blocks are the architecture model\'s; fill the other sections with the owner',
    'wrote docs/decisions/0004-one-gate.md, a proposal for the owner to approve (one-way doors one at a time)',
    'wrote docs/domains/records.md: its # Surface lists the architecture model\'s 0 slices; cite each one\'s stories as elaboration writes them',
    'increments along minimal\'s layers, for the intent\'s # Increments:',
    '- I-<n>.1 Walking skeleton: one call through gate, end to end on the target',
    '- I-<n>.2 records: what exists',
    '- I-<n>.3 A first extension, declaring namespace',
    '',
  ].join('\n'));
  assert.equal(JSON.parse(read(dir, '.aidlc/profile.json')).model.name, 'minimal');
  assert.match(read(dir, 'docs/system/bak.md'), /\n# Building Block View\n- \*\*gate\*\* \(pipeline\): checks each request\n- \*\*records\*\* \(domain\): what exists\n/);
  assert.match(read(dir, 'docs/decisions/0004-one-gate.md'), /^title: 0004 One gate\nmodel: minimal$/m);
  assert.doesNotMatch(run(dir, ['models', 'apply', 'minimal']).out, /^(chose|wrote)/m, 'applying again copies nothing twice');
  assert.match(run(dir, ['models', 'apply', 'nothere']).err, /no architecture model nothere in the format/);
});

test('B231/AC-2 gaps matches the modules to the chosen model\'s items and kinds, and prints the missing ones as increments', () => {
  const profile = { ...V2, model: { name: 'minimal' }, modules: [{ id: 'gw', kind: 'pipeline', layer: 'gate', paths: ['src/gw/**'] }, { id: 'store', kind: 'foundation', layer: 'records', paths: ['src/store/**'] }] };
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n', '.aidlc/models/minimal/model.json': model('minimal', { extension: { kind: 'extension', declares: ['namespace'] } }) }, profile);
  assert.equal(run(dir, ['models', 'gaps']).out, [
    'architecture model minimal: 2 of 2 items played by modules (modules[].layer)',
    '  gate: gw (pipeline)',
    '  records: store is foundation, the architecture model\'s records is domain',
    'missing, for the brownfield intent\'s # Increments:',
    '- I-<n>.1 extension (extension): namespace',
    '',
  ].join('\n'));
  assert.match(run(makeRepo({}, V2), ['models', 'gaps']).err, /the profile chooses no architecture model/);
});

// The example control-plane model, kept outside the plugin (decision 0025), as a project that adopts it holds it.
const EXAMPLE = join(import.meta.dirname, '..', 'examples/models/control-plane');
const adopt = (dir) => cpSync(EXAMPLE, join(dir, '.aidlc/models/control-plane'), { recursive: true });

test('B232/AC-1 the example control-plane model is in generic names (the neutral test scans it): in the format, its decisions valid MADR proposals once applied', () => {
  const root = join(import.meta.dirname, '..'), dir = 'examples/models/control-plane';
  const files = ['model.json', ...readdirSync(join(root, dir, 'decisions')).map((f) => `decisions/${f}`), ...readdirSync(join(root, dir, 'knowledge')).map((f) => `knowledge/${f}`)];
  assert.ok(files.length > 6, 'model, decisions, knowledge'); // tests/neutral.test.mjs holds every file under examples/ to naming no vendor
  const cp = JSON.parse(read(root, `${dir}/model.json`));
  assert.deepEqual(cp.layers.map((l) => l.id), ['frontdoor', 'authenticate', 'authorize', 'policy', 'lock', 'throttle']);
  assert.deepEqual(cp.rules.map((r) => r.type), ['stageOrder', 'extensionDeclaration', 'longRunning', 'idempotency', 'data', 'events']);
  const project = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  adopt(project);
  assert.equal(run(project, ['models']).out, 'control-plane (project): Control plane\n', 'in the format');
  const applied = run(project, ['models', 'apply', 'control-plane']).out;
  assert.equal((applied.match(/a proposal for the owner to approve/g) ?? []).length, 5);
  assert.deepEqual(run(project, ['check', 'docs']).out.split('\n').filter((l) => /DOC-SCHEMA|OKF-FM|MODEL-FORMAT/.test(l)), [], 'the decisions are MADR');
  const copied = readdirSync(join(project, 'docs/decisions')).filter((f) => /^\d{4}-/.test(f)).map((f) => readFileSync(join(project, 'docs/decisions', f), 'utf8'));
  for (const text of copied) {
    assert.match(text, /^date: \d{4}-\d{2}-\d{2}$/m, 'MADR\'s date, when it was copied');
    assert.match(text, /^### Consequences$/m, 'MADR\'s consequences, good and bad');
  }
});

test('B232/AC-2 the model\'s contract applies only where a project chose it (decision 0021)', () => {
  const spec = 'openapi: 3.1.0\ninfo: { title: x, version: 2026-10-01 }\npaths: {}\ncomponents:\n  schemas:\n    Thing:\n      properties: { id: {}, name: {}, type: {} }\n';
  const found = (profile) => { const dir = makeRepo({ ...I1, 'api/things/openapi.yaml': spec }, profile); adopt(dir); return run(dir, ['check']).out.split('\n').filter((l) => /CONTRACT-NAME/.test(l)).map((l) => l.replace(/ → .*$/, '')); };
  assert.deepEqual(found(V2), [], 'the generic grammar asks no systemData');
  assert.deepEqual(found({ ...V2, model: { name: 'control-plane' } }), ["api/things/openapi.yaml:1 CONTRACT-NAME components.schemas.Thing: a resource without systemData, which its architecture model's API contract asks"]);
});

test('B233/AC-1 the control-plane model\'s Go reference meets the model\'s rules and contract, and covers its walking skeleton', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, {});
  cpSync(join(EXAMPLE, 'reference/go'), dir, { recursive: true });
  adopt(dir);
  const profile = {
    ...V2, system: { core: ['internal/**', 'cmd/**'] },
    model: { name: 'control-plane', wiring: { file: 'cmd/frontdoor/frontdoor.go', pattern: 'stages\\.Stage(\\w+)' }, operations: { status: 'Operation-Status', result: 'Location', retry: 'Retry-After' }, events: { files: ['api/events/*.yaml'] } },
    modules: [
      { id: 'frontdoor', kind: 'runtime', layer: 'frontdoor', paths: ['cmd/frontdoor/**'] },
      ...['authenticate', 'authorize', 'policy', 'lock', 'throttle'].map((s) => ({ id: s, kind: 'pipeline', layer: s, paths: [`internal/pipeline/stages/**`] })),
      { id: 'resources', kind: 'domain', layer: 'resources', paths: ['internal/domains/resources/**'] },
      { id: 'operations', kind: 'domain', layer: 'operations', paths: ['internal/domains/operations/**'] },
      { id: 'things', kind: 'extension', paths: ['api/things/**'], declares: { namespace: 'Example.Things', types: ['things', 'widgets'], longRunning: ['widgets'] } },
    ],
  };
  write(dir, { '.aidlc/profile.json': profile });
  const lines = run(dir, ['check']).out.split('\n').filter((l) => /PIPELINE-ORDER|EXTENSION-DECLARATION|LONG-RUNNING|EVENT-COVERAGE|CONTRACT-NAME/.test(l));
  assert.deepEqual(lines, [], 'the reference meets the stage order, extension contract, long-running shapes, events and the model\'s contract');
  assert.match(run(dir, ['models', 'gaps']).out, /^architecture model control-plane: 8 of 10 items played by modules[\s\S]*missing, for the brownfield intent's # Increments:\n- I-<n>\.1 deployments \(domain\)[^\n]*\n- I-<n>\.2 activity \(domain\)/m, 'the walking skeleton: no deployments or activity yet');
});

test('B234/AC-1 the architect persona reads how to model a reference and apply a model, naming every rule type the CLI knows', () => {
  const dir = makeRepo();
  const out = run(dir, ['persona', 'architect']).out;
  assert.match(out, /architect\/models\.md/, 'its knowledge lists the models file');
  const knowledge = read(join(import.meta.dirname, '..'), 'plugin/personas/architect/models.md');
  for (const type of config.models.ruleTypes) assert.ok(knowledge.includes(`\`${type}\``), `${type} is explained`);
  for (const step of ['Horizontal first', 'Then vertical', 'MODEL-SOURCE', 'aidlc models apply', 'aidlc models gaps']) assert.ok(knowledge.includes(step), step);
});

test('the control-plane Go reference keeps its values in data and its code in vertical slices, as every project must', async () => {
  const { sliceFindings, valueFindings } = await import('../plugin/cli/extensions/stacks/index.mjs');
  const dir = makeRepo({}, {});
  cpSync(join(import.meta.dirname, '..', 'examples/models/control-plane/reference/go'), dir, { recursive: true });
  const profile = { system: { core: ['internal/**', 'cmd/**'] }, values: { data: ['internal/foundation/values/**'] },
    modules: [{ id: 'resources', kind: 'domain', paths: ['internal/domains/resources/**'] }, { id: 'operations', kind: 'domain', paths: ['internal/domains/operations/**'] }, { id: 'frontdoor', kind: 'runtime', paths: ['cmd/frontdoor/**'] }] };
  assert.deepEqual(sliceFindings(dir, profile).map((f) => `${f.code} ${f.path}`), []);
  const added = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.go')).map((f) => f.split(sep).join('/'))
    .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n').map((text, k) => ({ file: f, line: k + 1, text })));
  assert.deepEqual(valueFindings(dir, profile, [], added).map((f) => `${f.path}:${f.line} ${f.data.value}`), [], 'every line read as added: no literal value in code');
  assert.ok(existsSync(join(dir, 'internal/domains/operations/getoperation/application/handler_test.go')), 'the operations query slice, with its test');
});

// M28 B247: slices in models (docs/design/vertical-slices.md#planned-before-built).
const SLICED = { domains: [{ id: 'records', kind: 'domain', role: 'what exists', slices: [
  { kind: 'Command', verb: 'create', useCase: 'a client records what exists' }, { kind: 'Query', verb: 'get', useCase: 'a client reads one record' }, { kind: 'Query', verb: 'list', useCase: 'a client lists the records' }] }],
  extension: { declares: ['namespace'], slices: [{ kind: 'Command', verb: 'delete', useCase: 'a client removes one' }] } };

test('B247/AC-1 a model\'s slices take a kind the slice checks know, a registry verb and a use case, a kind and verb once per domain', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', SLICED) });
  assert.deepEqual(formatLines(dir), [], 'a model with slices in the format');
  const bad = { domains: [{ id: 'records', kind: 'domain', slices: [{ kind: 'Event', verb: 'create', useCase: 'x' }, { kind: 'Query', verb: 'fetch', useCase: 'y' }, { kind: 'Query', verb: 'get' }, { kind: 'Query', verb: 'get', useCase: 'z' }] }], extension: { declares: ['namespace'], slices: 'all' } };
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', bad) });
  const lines = formatLines(dir).join('\n');
  for (const want of ['a slice of records has kind Event, not one of Command, Query', 'a slice of records has verb fetch, which the naming registry lacks', 'the get slice of records names no use case', 'records lists the Query get slice twice', 'extension.slices is a list']) assert.ok(lines.includes(want), `${want}\n${lines}`);
  write(dir, { '.aidlc/profile.json': { ...V2, naming: { ...V2.naming, vocabularies: { verb: ['fetch'] } } } });
  assert.doesNotMatch(formatLines(dir).join('\n'), /verb fetch/, 'the project\'s own registry verbs count');
});

test('B247/AC-2 apply writes each model domain\'s doc with its # Surface, names composed by the registry, and prints the increments slice by slice', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', SLICED) });
  const out = run(dir, ['models', 'apply', 'sliced']).out;
  assert.match(out, /^wrote docs\/domains\/records\.md: its # Surface lists the architecture model's 3 slices/m);
  assert.match(out, /- I-<n>\.1 Walking skeleton: one call through gate, end to end on the target, serving Command createrecord\n- I-<n>\.2 records: Query getrecord, a client reads one record\n- I-<n>\.3 records: Query listrecord, a client lists the records\n- I-<n>\.4 A first extension, declaring namespace; Command delete: a client removes one\n/);
  const doc = read(dir, 'docs/domains/records.md');
  assert.match(doc, /^code: records$/m);
  assert.match(doc, /^# Surface\n- Command createrecord: a client records what exists\n- Query getrecord: a client reads one record\n- Query listrecord: a client lists the records\n/m);
  assert.doesNotMatch(doc, /^- (Command|Query) <slice>/m, 'the template\'s slice lines are replaced');
  assert.match(doc, /^- Events: /m, 'the rest of the section stays');
  assert.match(run(dir, ['name', 'slice', '--domain', 'records', '--verb', 'get']).out, /^getrecord$/m, 'the same name aidlc name slice composes');
});

test('B247/AC-3 gaps lists the model slices a played domain\'s doc does not list, as increments', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n', 'docs/domains/records.md': '---\ntype: Domain\ntitle: Records\ndescription: d.\ncode: records\nkind: domain\n---\n\n# Surface\n- Command createrecord: a client records what exists [I-1:US1.1]\n' },
    { ...V2, model: { name: 'sliced' }, modules: [{ id: 'gate', kind: 'pipeline', layer: 'gate', paths: ['src/gate/**'] }, { id: 'records', kind: 'domain', layer: 'records', paths: ['src/records/**'] }, { id: 'ext', kind: 'extension', paths: ['src/ext/**'] }] });
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', SLICED) });
  const out = run(dir, ['models', 'gaps']).out;
  assert.match(out, /missing, for the brownfield intent's # Increments:\n- I-<n>\.1 records: Query getrecord, a client reads one record\n- I-<n>\.2 records: Query listrecord, a client lists the records\n$/, out);
});

test('B247/AC-4 the example model lists its slices, and its Go reference names them as the registry composes them', async () => {
  const { sliceFindings } = await import('../plugin/cli/extensions/stacks/index.mjs');
  const dir = makeRepo({}, {});
  adopt(dir);
  assert.deepEqual(formatLines(dir), [], 'the example with its slices is in the format');
  cpSync(join(EXAMPLE, 'reference/go'), dir, { recursive: true });
  const profile = { system: { core: ['internal/**', 'cmd/**'] }, naming: { tokens: { system: 'cp' }, domains: { resources: {}, operations: {} } },
    modules: [{ id: 'resources', kind: 'domain', paths: ['internal/domains/resources/**'] }, { id: 'operations', kind: 'domain', paths: ['internal/domains/operations/**'] }, { id: 'frontdoor', kind: 'runtime', paths: ['cmd/frontdoor/**'] }] };
  assert.deepEqual(sliceFindings(dir, profile).filter((f) => f.code === 'SLICE-NAME').map((f) => f.path), [], 'createresource, deleteresource and getoperation are registry names');
  const cp = JSON.parse(readFileSync(join(EXAMPLE, 'model.json'), 'utf8'));
  for (const d of cp.domains) assert.ok(d.slices?.length, `${d.id} lists its slices`);
  assert.ok(cp.extension.slices?.length, 'the extension lists the slices a provider offers');
});

// M29 B250: a model's slices carry their declaration, and each runtime what it applies (docs/design/slice-method.md#one-grammar).
const DECLARED = { layers: [{ id: 'front', kind: 'runtime', role: 'serves', applies: ['gate', 'outcomeEvents'] }, { id: 'gate', kind: 'pipeline', role: 'checks each request' }],
  domains: [{ id: 'records', kind: 'domain', role: 'what exists', slices: [
    { kind: 'Query', verb: 'get', useCase: 'a client reads one record', cuts: ['interface', 'application'], entry: 'front' },
    { kind: 'Command', verb: 'create', useCase: 'a client records what exists', cuts: ['interface', 'application', 'model', 'infrastructure', 'migration'], data: ['data/records/records'], entry: 'front', async: true, emits: ['RecordCreated.v1'] }] }],
  extension: { declares: ['namespace'] } };

test('B250/AC-3 a model slice declares its cuts and what it reaches, MODEL-FORMAT checks them, and each runtime applies stages or outcomes', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', DECLARED) });
  assert.deepEqual(formatLines(dir), [], 'a declared model in the format');
  const bad = { ...DECLARED, layers: [{ ...DECLARED.layers[0], applies: ['gate', 'caching'] }, DECLARED.layers[1]], domains: [{ id: 'records', kind: 'domain', slices: [
    { kind: 'Query', verb: 'get', useCase: 'x', entry: 'front' }, { kind: 'Command', verb: 'create', useCase: 'y', cuts: ['interface', 'screen'], entry: 'gate', calls: ['billing'], colour: 'red' }] }] };
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', bad) });
  const lines = formatLines(dir).join('\n');
  for (const want of ['the Query get slice of records says what it reaches but not which layers it cuts', 'the Command create slice of records cuts screen, a layer no stack pack has',
    'the Command create slice of records is served by gate, which is no runtime layer of the architecture model', 'the Command create slice of records calls billing, which is no domain, the extension or an adapter layer',
    'the Command create slice of records has colour, which is no part of a slice', 'runtime front applies caching, which is neither a pipeline layer of the architecture model nor one of outcomeEvents, statusContract']) assert.match(lines, new RegExp(want.replace(/[()]/g, '\\$&')), lines);
});

test('B250/AC-3 apply writes each slice\'s declaration into # Surface and starts the skeleton from the slice that cuts the most layers; gaps lists what a line lacks', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', DECLARED) });
  const out = run(dir, ['models', 'apply', 'sliced']).out;
  assert.match(out, /- I-<n>\.1 Walking skeleton: one call through front → gate, end to end on the target, serving Command createrecord\n- I-<n>\.2 records: Query getrecord \(interface, application; entry front\), a client reads one record\n/, out);
  assert.match(read(dir, 'docs/domains/records.md'), /^- Query getrecord \(interface, application; entry front\): a client reads one record\n- Command createrecord \(interface, application, model, infrastructure, migration; data data\/records\/records; entry front; async; emits RecordCreated\.v1\): a client records what exists\n/m);
  const played = { ...V2, model: { name: 'sliced' }, modules: [{ id: 'front', kind: 'runtime', layer: 'front', paths: ['src/front/**'] }, { id: 'gate', kind: 'pipeline', layer: 'gate', paths: ['src/gate/**'] }, { id: 'records', kind: 'domain', layer: 'records', paths: ['src/records/**'] }, { id: 'ext', kind: 'extension', paths: ['src/ext/**'] }] };
  const gaps = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n', 'docs/domains/records.md': '---\ntype: Domain\ntitle: Records\ndescription: d.\ncode: records\nkind: domain\n---\n\n# Surface\n- Query getrecord (interface, application; entry front): reads [I-1:US1.1]\n- Command createrecord (interface, application; entry front): records [I-1:US1.2]\n' }, played);
  write(gaps, { '.aidlc/models/sliced/model.json': model('sliced', DECLARED) });
  assert.match(run(gaps, ['models', 'gaps']).out, /- I-<n>\.1 records: Command createrecord on its # Surface line lacks cuts, data, async, emits\n$/);
});

test('B250/AC-3 intake lists a fitting model\'s slices with their cuts and hand-offs', () => {
  const dir = makeRepo({}, V2);
  write(dir, { '.aidlc/models/sliced/model.json': model('sliced', { ...DECLARED, fit: { words: ['records'] } }) });
  assert.match(run(dir, ['intake', 'Clients keep records online.']).out, /its slices: Query getrecord \(interface, application; entry front\), Command createrecord \(interface, application, model, infrastructure, migration; data data\/records\/records; entry front; async; emits RecordCreated\.v1\)/);
});

test('B250/AC-1 B250/AC-4 the glossary, the templates, the personas and the example model carry a slice\'s declaration', async () => {
  const { readFileSync } = await import('node:fs');
  const { config } = await import('../plugin/cli/lib/index.mjs');
  const V = config.vocabulary, root = join(import.meta.dirname, '..'), text = (p) => readFileSync(join(root, p), 'utf8');
  for (const word of ['cut', 'entry', 'hand-off', 'permission']) assert.ok(V.words.some((w) => w.word === word), word);
  assert.deepEqual(['schema', 'action', 'mode', 'part', 'contract'].map((w) => V.retired.find((r) => r.word === w)?.use), ['migration', 'permission', 'async', 'cut', 'declaration'], 'each clashing word sends to the one it means');
  assert.match(text('plugin/templates/docs/domain.md'), /^- Command <slice> \(<cut>, …; data <node>; entry <runtime>; …\): /m);
  assert.match(text('plugin/templates/docs/domain.md'), /^- Events: <Noun><PastTenseVerb>, the integration events other domains consume$/m);
  assert.match(text('plugin/templates/docs/intent.md'), /^- Slices: <Command or Query> <slice> \(<cut>, …; data <node>; entry <runtime>;/m);
  assert.match(text('plugin/personas/product-analyst.md'), /a story served through a screen cuts `ui`/);
  assert.match(text('plugin/personas/architect.md'), /the layers it cuts, then the data, entry, permission and hand-offs it has/);
  const m = JSON.parse(text('examples/models/control-plane/model.json'));
  assert.ok(m.layers.find((l) => l.kind === 'runtime').applies.includes('statusContract'), 'the front door applies the status contract');
  assert.deepEqual(m.domains.flatMap((d) => d.slices).filter((s) => !s.cuts?.length), [], 'every slice of the example declares its cuts');
  const dir = makeRepo({}, {});
  adopt(dir);
  assert.deepEqual(formatLines(dir), [], 'the declared example is in the format');
});

test('decision 0021: models apply records the chosen architecture model\'s naming grammar as the profile\'s model.grammar, replacing it on each apply and leaving naming.grammar to the project', () => {
  const model = JSON.parse(readFileSync(join(import.meta.dirname, '../examples/models/control-plane/model.json'), 'utf8'));
  const own = { event: { template: '{{Namespace}}.{{TypePascal}}{{PastVerb}}' } }, path = (dir) => run(dir, ['name', 'path', '--domain', 'things']).out.trim();
  const dir = makeRepo({ '.aidlc/models/control-plane/model.json': JSON.stringify(model) }, { naming: { tokens: { system: 'shop', org: 'acme' }, domains: { things: {} }, grammar: own } });
  const profile = () => JSON.parse(read(dir, '.aidlc/profile.json'));
  assert.match(run(dir, ['models', 'apply', 'control-plane']).out, /recorded the architecture model's names for path in \.aidlc\/profile\.json \(model\.grammar/);
  assert.deepEqual(profile().model.grammar, model.contract.grammar, 'the model layer');
  assert.deepEqual(profile().naming.grammar, own, 'the project\'s own grammar untouched');
  assert.equal(path(dir), '/providers/Acme.Shop/things/{thingName}');
  assert.doesNotMatch(run(dir, ['models', 'apply', 'control-plane']).out, /recorded the architecture model's names/, 'once');
  // The model edited: re-applying replaces the model layer whole, so a kind it no longer names goes with it.
  write(dir, { '.aidlc/models/control-plane/model.json': JSON.stringify({ ...model, contract: { ...model.contract, grammar: { metric: { template: '{{system}}_{{metricSnake}}_{{unit}}' } } } }) });
  assert.match(run(dir, ['models', 'apply', 'control-plane']).out, /names for metric in/);
  assert.deepEqual(profile().model.grammar, { metric: { template: '{{system}}_{{metricSnake}}_{{unit}}' } });
  assert.deepEqual(profile().naming.grammar, own);
  assert.equal(path(dir), '/things/{thingName}', 'the old model\'s path is gone');
  // A model with no grammar clears the layer.
  write(dir, { '.aidlc/models/control-plane/model.json': JSON.stringify({ ...model, contract: { ...model.contract, grammar: undefined } }) });
  run(dir, ['models', 'apply', 'control-plane']);
  assert.equal(profile().model.grammar, undefined);
  assert.deepEqual(profile().naming.grammar, own);
});
