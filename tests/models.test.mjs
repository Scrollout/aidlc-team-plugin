// M24: architecture models as data (docs/design/models.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/index.mjs';
import { CHILD_ENV, commit, I1, makeRepo, pinnedRepo, read, run, write } from './state-repo.mjs';

const model = (name, extra = {}) => ({
  name, title: `${name} shape`, description: 'A minimal shape.',
  layers: [{ id: 'gate', kind: 'pipeline', role: 'checks each request' }], domains: [{ id: 'records', kind: 'domain', role: 'what exists' }],
  slice: { declares: ['namespace'] }, contracts: [{ from: 'gate', to: 'slice', via: 'http' }], rules: [{ type: 'stageOrder', stages: ['gate'] }], ...extra,
});
const decision = '---\ntype: Decision\ntitle: 0001 One gate\ndescription: d.\n---\n\n# Context and Problem Statement\nx\n';
const formatLines = (dir) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => /MODEL-FORMAT/.test(l)).map((l) => l.replace(/ → .*$/, ''));
// The project's pinned CLI, whose shipped models sit beside it in .aidlc/bin/models/.
const pinnedRun = (dir, args) => spawnSync(process.execPath, [join(dir, '.aidlc/bin/aidlc.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: CHILD_ENV }).stdout;

test('B228/AC-1 a model folder loads from the project and the shipped models, the project\'s winning, and check reports one that breaks the format', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' });
  assert.equal(run(dir, ['models']).out, 'control-plane (shipped): Control plane\n');
  write(dir, { '.aidlc/models/minimal/model.json': model('minimal'), '.aidlc/models/minimal/decisions/0001-one-gate.md': decision });
  assert.equal(run(dir, ['models']).out, 'control-plane (shipped): Control plane\nminimal (project): minimal shape\n');
  assert.deepEqual(formatLines(dir), [], 'a model in the format');

  const broken = model('other', { slice: undefined, layers: [{ id: 'gate', kind: 'hub' }, { id: 'gate', kind: 'pipeline' }], rules: [{ type: 'magic' }], contracts: [{ from: 'gate', to: 'nowhere' }] });
  write(dir, { '.aidlc/models/broken/model.json': broken, '.aidlc/models/broken/decisions/notes.md': '# notes\n', '.aidlc/models/empty/README.md': 'x' });
  assert.match(run(dir, ['models']).out, /\nbroken \(project\): other shape, 7 format problems: aidlc check\n/);
  const lines = formatLines(dir).join('\n');
  for (const want of ['model broken lacks slice', 'model broken is named other inside', 'model broken: gate has kind hub', 'model broken: gate is named twice', 'model broken: rule type magic is not one of stageOrder', "model broken: a contract's to is nowhere", 'model broken: decisions/notes.md is not a Decision doc', 'model empty has no model.json']) {
    assert.ok(lines.includes(want), want);
  }

  const pinned = pinnedRepo();
  write(pinned, { '.aidlc/bin/models/minimal/model.json': model('minimal', { title: 'shipped shape' }), '.aidlc/bin/models/second/model.json': model('second') });
  assert.equal(pinnedRun(pinned, ['models']), 'control-plane (shipped): Control plane\nminimal (shipped): shipped shape\nsecond (shipped): second shape\n', 'the pinned copy carries the shipped models');
  write(pinned, { '.aidlc/models/minimal/model.json': model('minimal', { title: 'project shape' }) });
  assert.equal(pinnedRun(pinned, ['models']), 'control-plane (shipped): Control plane\nminimal (project): project shape\nsecond (shipped): second shape\n', 'the project\'s own wins');
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
  assert.match(run(dir, ['models', 'doc', 'nothere']).err, /no project model nothere in \.aidlc\/models/);
});

test('B229/AC-2 each layer, domain and rule of a project model cites a source of its research (MODEL-SOURCE)', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  write(dir, { 'docs/intents/I-1-model-the-reference.md': intent('research: [reference]\n'), 'docs/research/reference.md': research,
    '.aidlc/models/minimal/model.json': model('minimal', { layers: [{ id: 'gate', kind: 'pipeline', sources: ['s1'] }], domains: [{ id: 'records', kind: 'domain' }], rules: [{ type: 'stageOrder', sources: ['s9'] }] }) });
  assert.deepEqual(findings(dir, 'MODEL-SOURCE'), [
    'MODEL-SOURCE I-1 model minimal: records cites no source',
    'MODEL-SOURCE I-1 model minimal: stageOrder cites s9, no source of reference',
  ]);
});

// A model with each rule type, and a project that chose it, with the names only it knows in its profile.
const RULES = [
  { type: 'stageOrder', stages: ['authenticate', 'authorize', 'policy'] },
  { type: 'sliceContract', kind: 'extension', declares: ['namespace', 'types'] },
  { type: 'longRunning', shapes: [{ code: 201, links: ['status'] }, { code: 202, links: ['result'] }], deleteAbsent: 204 },
  { type: 'idempotency', writes: '\\b(creates?|updates?)\\b', repeat: '\\b(again|repeated)\\b.*\\bunchanged\\b' },
  { type: 'data', classes: ['regional', 'shared', 'global'] },
  { type: 'events', verbs: ['put', 'patch', 'post', 'delete'] },
];
const chosen = (slice) => ({ ...V2, model: { name: 'minimal', wiring: { file: 'src/gate/stages.txt', pattern: 'Stage(\\w+)' }, operations: { status: 'Op-Status', result: 'Op-Result', retry: 'Retry-After' }, events: { files: ['api/events/*.yaml'] } },
  modules: [{ id: 'gate', kind: 'pipeline', paths: ['src/gate/**'] }, { id: 'things', kind: 'extension', paths: ['src/things/**'], slice }] });
const api = (put, del) => `openapi: 3.1.0\ninfo: { title: t, version: 2026-10-01 }\npaths:\n  /things/{thingName}:\n    put:\n${put}\n    delete:\n${del}\n`;
const ruleLines = (dir) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => /PIPELINE-ORDER|PROVIDER-CONTRACT|LONG-RUNNING|IDEMPOTENCY-AC|DATA-PARTITION|EVENT-COVERAGE/.test(l)).map((l) => l.replace(/ → .*$/, '')).join('\n');

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
    'src/gate/stages.txt:1 PIPELINE-ORDER model minimal: the stages come as authenticate, policy, authorize, not in the model\'s order authenticate, authorize, policy',
    '.aidlc/profile.json:1 PROVIDER-CONTRACT model minimal: module things (extension) declares no types under `slice`',
    'api/things/openapi.yaml:1 LONG-RUNNING model minimal: PUT /things/{thingName} is flagged long-running but answers none of 201 with Op-Status and Retry-After, or 202 with Op-Result and Retry-After',
    'api/things/openapi.yaml:1 LONG-RUNNING model minimal: DELETE /things/{thingName} declares no 204 answer for an absent resource',
    'api/things/openapi.yaml:1 EVENT-COVERAGE model minimal: PUT /things/{thingName} emits things.written, which no events file defines',
    'api/things/openapi.yaml:1 EVENT-COVERAGE model minimal: DELETE /things/{thingName} names no events under x-events',
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
  assert.match(run(dir, ['intake', 'Every request passes the gate. The records keep what exists. Nothing else.']).out, /\n  models that fit: minimal \(Q-1\.1, Q-1\.2\); once the owner picks one: aidlc models apply <name>\n/);
  const r = run(dir, ['models', 'apply', 'minimal']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, [
    'chose minimal in .aidlc/profile.json',
    'wrote docs/system/bak.md: its building blocks are the model\'s; fill the other sections with the owner',
    'wrote docs/decisions/0004-one-gate.md, a proposal for the owner to approve (one-way doors one at a time)',
    'increments along minimal\'s layers, for the intent\'s # Increments:',
    '- I-<n>.1 Walking skeleton: one request through gate, end to end on the target',
    '- I-<n>.2 records: what exists',
    '- I-<n>.3 A first vertical slice, declaring namespace',
    '',
  ].join('\n'));
  assert.equal(JSON.parse(read(dir, '.aidlc/profile.json')).model.name, 'minimal');
  assert.match(read(dir, 'docs/system/bak.md'), /\n# Building Block View\n- \*\*gate\*\* \(pipeline\): checks each request\n- \*\*records\*\* \(domain\): what exists\n/);
  assert.match(read(dir, 'docs/decisions/0004-one-gate.md'), /^title: 0004 One gate\nmodel: minimal$/m);
  assert.doesNotMatch(run(dir, ['models', 'apply', 'minimal']).out, /^(chose|wrote)/m, 'applying again copies nothing twice');
  assert.match(run(dir, ['models', 'apply', 'nothere']).err, /no model nothere in the format/);
});

test('B231/AC-2 gaps matches the modules to the chosen model\'s items and kinds, and prints the missing ones as increments', () => {
  const profile = { ...V2, model: { name: 'minimal' }, modules: [{ id: 'gw', kind: 'pipeline', layer: 'gate', paths: ['src/gw/**'] }, { id: 'store', kind: 'foundation', layer: 'records', paths: ['src/store/**'] }] };
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n', '.aidlc/models/minimal/model.json': model('minimal', { slice: { kind: 'extension', declares: ['namespace'] } }) }, profile);
  assert.equal(run(dir, ['models', 'gaps']).out, [
    'model minimal: 2 of 2 items played by modules (modules[].layer)',
    '  gate: gw (pipeline)',
    '  records: store is foundation, the model\'s records is domain',
    'missing, for the brownfield intent\'s # Increments:',
    '- I-<n>.1 slice (extension): namespace',
    '',
  ].join('\n'));
  assert.match(run(makeRepo({}, V2), ['models', 'gaps']).err, /the profile chooses no model/);
});

test('B232/AC-1 the control-plane model ships in generic names (the neutral test scans it): in the format, its decisions valid MADR proposals once applied', () => {
  const root = join(import.meta.dirname, '..'), dir = 'plugin/cli/models/control-plane';
  const files = ['model.json', ...readdirSync(join(root, dir, 'decisions')).map((f) => `decisions/${f}`), ...readdirSync(join(root, dir, 'knowledge')).map((f) => `knowledge/${f}`)];
  assert.ok(files.length > 6, 'model, decisions, knowledge'); // tests/neutral.test.mjs holds every file under plugin/ to naming no vendor
  const cp = JSON.parse(read(root, `${dir}/model.json`));
  assert.deepEqual(cp.layers.map((l) => l.id), ['frontdoor', 'authenticate', 'authorize', 'policy', 'lock', 'throttle']);
  assert.deepEqual(cp.rules.map((r) => r.type), ['stageOrder', 'sliceContract', 'longRunning', 'idempotency', 'data', 'events']);
  const project = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, V2);
  assert.equal(run(project, ['models']).out, 'control-plane (shipped): Control plane\n', 'in the format');
  const applied = run(project, ['models', 'apply', 'control-plane']).out;
  assert.equal((applied.match(/a proposal for the owner to approve/g) ?? []).length, 5);
  assert.deepEqual(run(project, ['check', 'docs']).out.split('\n').filter((l) => /DOC-SCHEMA|OKF-FM|MODEL-FORMAT/.test(l)), [], 'the decisions are MADR');
});

test('B232/AC-2 the model\'s contract applies only where a project chose it (decision 0021)', () => {
  const spec = 'openapi: 3.1.0\ninfo: { title: x, version: 2026-10-01 }\npaths: {}\ncomponents:\n  schemas:\n    Thing:\n      properties: { id: {}, name: {}, type: {} }\n';
  const found = (profile) => run(makeRepo({ ...I1, 'api/things/openapi.yaml': spec }, profile), ['check']).out.split('\n').filter((l) => /CONTRACT-NAME/.test(l)).map((l) => l.replace(/ → .*$/, ''));
  assert.deepEqual(found(V2), [], 'the generic grammar asks no systemData');
  assert.deepEqual(found({ ...V2, model: { name: 'control-plane' } }), ["api/things/openapi.yaml:1 CONTRACT-NAME components.schemas.Thing: a resource without systemData, which its model's contract asks"]);
});

test('B233/AC-1 the Go pack\'s control-plane reference meets the model\'s rules and contract, and covers its walking skeleton', () => {
  const dir = makeRepo({ 'docs/index.md': '---\nokf_version: 0.2\n---\n' }, {});
  cpSync(join(import.meta.dirname, '..', 'plugin/packs/go/reference'), dir, { recursive: true });
  const profile = {
    ...V2, system: { core: ['internal/**', 'cmd/**'] },
    model: { name: 'control-plane', wiring: { file: 'cmd/frontdoor/frontdoor.go', pattern: 'stages\\.Stage(\\w+)' }, operations: { status: 'Operation-Status', result: 'Location', retry: 'Retry-After' }, events: { files: ['api/events/*.yaml'] } },
    modules: [
      { id: 'frontdoor', kind: 'runtime', layer: 'frontdoor', paths: ['cmd/frontdoor/**'] },
      ...['authenticate', 'authorize', 'policy', 'lock', 'throttle'].map((s) => ({ id: s, kind: 'pipeline', layer: s, paths: [`internal/pipeline/stages/**`] })),
      { id: 'resources', kind: 'domain', layer: 'resources', paths: ['internal/domains/resources/**'] },
      { id: 'operations', kind: 'domain', layer: 'operations', paths: ['internal/domains/operations/**'] },
      { id: 'things', kind: 'extension', paths: ['api/things/**'], slice: { namespace: 'Example.Things', types: ['things', 'widgets'], longRunning: ['widgets'] } },
    ],
  };
  write(dir, { '.aidlc/profile.json': profile });
  const lines = run(dir, ['check']).out.split('\n').filter((l) => /PIPELINE-ORDER|PROVIDER-CONTRACT|LONG-RUNNING|EVENT-COVERAGE|CONTRACT-NAME/.test(l));
  assert.deepEqual(lines, [], 'the reference meets the stage order, slice contract, long-running shapes, events and the model\'s contract');
  assert.match(run(dir, ['models', 'gaps']).out, /^model control-plane: 8 of 10 items played by modules[\s\S]*missing, for the brownfield intent's # Increments:\n- I-<n>\.1 deployments \(domain\)[^\n]*\n- I-<n>\.2 activity \(domain\)/m, 'the walking skeleton: no deployments or activity yet');
});

test('B234/AC-1 the architect persona reads how to model a reference and apply a model, naming every rule type the CLI knows', () => {
  const dir = makeRepo();
  const out = run(dir, ['persona', 'architect']).out;
  assert.match(out, /architect\/models\.md/, 'its knowledge lists the models file');
  const knowledge = read(join(import.meta.dirname, '..'), 'plugin/cli/personas/architect/models.md');
  for (const type of config.models.ruleTypes) assert.ok(knowledge.includes(`\`${type}\``), `${type} is explained`);
  for (const step of ['Horizontal first', 'Then vertical', 'MODEL-SOURCE', 'aidlc models apply', 'aidlc models gaps']) assert.ok(knowledge.includes(step), step);
});
