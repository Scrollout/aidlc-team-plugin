// M26 B239: structured answers. Commands that serve values return them as data, render their text from it, and
// `--json` prints the whole answer as one object (docs/design/cli-engine.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approve, intentDoc, makeRepo, run, unitDoc } from './state-repo.mjs';

const json = (dir, ...args) => { const r = run(dir, [...args, '--json']); return { ...JSON.parse(r.out), exit: r.code }; };
const plan = () => {
  const dir = makeRepo({ 'docs/intents/I-1-pricing.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unitDoc({ scope: ['src/a/**'] }), 'docs/units/U-2-b.md': unitDoc({ scope: ['src/b/**'] }) });
  approve(dir, 'I-1');
  return dir;
};

test('B239/AC-1 next serves its action as { command, args } beside its line; status serves its rows and the same next', () => {
  const dir = plan();
  const next = json(dir, 'next');
  assert.equal(next.code, 2, 'the owner acts');
  assert.deepEqual([next.data.kind, next.data.key, next.data.command, next.data.args], ['human', 'nextApprovePlan', 'approve', ['U-1', 'U-2']]);
  assert.equal(next.output, `${next.data.line}\n`, 'the text is rendered from the data');
  const status = json(dir, 'status');
  assert.deepEqual(status.data.intents, [{ id: 'I-1', state: 'approved', title: 'Pricing' }]);
  assert.deepEqual(status.data.units.map((u) => [u.id, u.state]), [['U-1', 'draft'], ['U-2', 'draft']]);
  assert.deepEqual(status.data.next, next.data);
  for (const u of status.data.units) assert.match(status.output, new RegExp(`${u.id}.*${u.state}`));
});

test('B239/AC-1 lane, models and check serve their values as data; an agent step serves no command', () => {
  const dir = plan();
  approve(dir, 'U-1', 'U-2');
  const next = json(dir, 'next');
  assert.equal(next.data.key, 'nextBuild');
  assert.deepEqual([next.data.command, next.data.args], [null, []], 'starting builders is the lead\'s own step');
  const lane = json(dir, 'lane', 'U-1');
  assert.equal(lane.data.unit, 'U-1');
  assert.ok(lane.data.lane && lane.output.includes(lane.data.lane));
  const check = json(dir, 'check');
  assert.deepEqual(Object.keys(check.data).filter((k) => ['errors', 'warnings'].includes(k)).sort(), ['errors', 'warnings']);
  assert.equal(check.data.errors, check.findings.filter((f) => f.level === 'error').length);
  assert.ok(Array.isArray(json(dir, 'models').data?.models ?? []), 'models lists the models it sees');
});

test('B239/AC-2 --json prints { code, findings, output, data } for any command and an error as an object; the text form is unchanged', () => {
  const dir = plan();
  const text = run(dir, ['next']);
  const answer = json(dir, 'next');
  assert.deepEqual(Object.keys(answer).filter((k) => k !== 'exit').sort(), ['code', 'data', 'findings', 'output']);
  assert.equal(answer.output, text.out, 'the same text, inside the object');
  assert.equal(answer.code, text.code);
  assert.equal(answer.exit, text.code, 'the exit code is unchanged');
  const plain = json(dir, 'lane');
  assert.equal(plain.code, 64);
  assert.equal(plain.output, '');
  assert.match(plain.error, /./, 'a usage error is an answer too');
  const unknown = json(dir, 'nope');
  assert.deepEqual([unknown.code, unknown.data], [64, null]);
});
