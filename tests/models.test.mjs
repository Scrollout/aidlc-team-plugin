// M24: architecture models as data (docs/design/models.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { CHILD_ENV, commit, makeRepo, pinnedRepo, read, run, write } from './state-repo.mjs';

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
  assert.match(run(dir, ['models']).out, /^no models: the plugin ships none yet, and the project keeps its own in \.aidlc\/models\/<name>\//);
  write(dir, { '.aidlc/models/minimal/model.json': model('minimal'), '.aidlc/models/minimal/decisions/0001-one-gate.md': decision });
  assert.equal(run(dir, ['models']).out, 'minimal (project): minimal shape\n');
  assert.deepEqual(formatLines(dir), [], 'a model in the format');

  const broken = model('other', { slice: undefined, layers: [{ id: 'gate', kind: 'hub' }, { id: 'gate', kind: 'pipeline' }], rules: [{ type: 'magic' }], contracts: [{ from: 'gate', to: 'nowhere' }] });
  write(dir, { '.aidlc/models/broken/model.json': broken, '.aidlc/models/broken/decisions/notes.md': '# notes\n', '.aidlc/models/empty/README.md': 'x' });
  assert.match(run(dir, ['models']).out, /^broken \(project\): other shape, 7 format problems: aidlc check\n/);
  const lines = formatLines(dir).join('\n');
  for (const want of ['model broken lacks slice', 'model broken is named other inside', 'model broken: gate has kind hub', 'model broken: gate is named twice', 'model broken: rule type magic is not one of stageOrder', "model broken: a contract's to is nowhere", 'model broken: decisions/notes.md is not a Decision doc', 'model empty has no model.json']) {
    assert.ok(lines.includes(want), want);
  }

  const pinned = pinnedRepo();
  write(pinned, { '.aidlc/bin/models/minimal/model.json': model('minimal', { title: 'shipped shape' }), '.aidlc/bin/models/second/model.json': model('second') });
  assert.equal(pinnedRun(pinned, ['models']), 'minimal (shipped): shipped shape\nsecond (shipped): second shape\n');
  write(pinned, { '.aidlc/models/minimal/model.json': model('minimal', { title: 'project shape' }) });
  assert.equal(pinnedRun(pinned, ['models']), 'minimal (project): project shape\nsecond (shipped): second shape\n', 'the project\'s own wins');
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
    'PATHWAY-SKIP I-1 (model) skips its model step: a current Model doc for model: (aidlc models doc <name>), its model in the format',
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
  assert.match(findings(dir, 'PATHWAY-SKIP').join('\n'), /skips its model step/, 'a model changed since its doc');
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
