// M24: architecture models as data (docs/design/models.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { CHILD_ENV, makeRepo, pinnedRepo, run, write } from './state-repo.mjs';

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
