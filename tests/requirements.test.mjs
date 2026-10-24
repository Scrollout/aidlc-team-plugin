import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintPlan, readPlan } from '../plugin/cli/lib/grid.mjs';
import { checkBundle, writeIndexes } from '../plugin/cli/lib/okf.mjs';
import { approve, branch, commit, intentDoc, makeRepo, merge, read, run, tempDir, unitDoc, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const FX = join(ROOT, 'tests/fixtures/requirements');
const lint = (name) => lintPlan(join(FX, name), {}, { base: FX }).filter((f) => f.code !== 'PLAN-DESIGN'); // design rows: tests/design.test.mjs

test('U10/AC-1 U22/AC-3 requirements are read by ID number and named as their files; PLAN-REQ fires on none or unknown citations', () => {
  const plan = readPlan(join(FX, 'cited'));
  assert.deepEqual(plan.requirements.map((r) => r.id), ['R-004', 'R-018'], 'register.md is not a requirement');
  assert.deepEqual(plan.units[0].requirements, ['R-004', 'R-018'], 'citations print as the files name them');
  assert.deepEqual(lint('cited'), []);

  const found = lint('uncited').map((f) => [f.code, f.message]);
  assert.deepEqual(found, [
    ['PLAN-REQ', 'I-1 cites no requirement'],
    ['PLAN-REQ', 'U-1 cites no requirement'],
    ['PLAN-REQ', 'U-2 cites R-7, which does not exist'],
  ]);
  assert.deepEqual(lint('none'), [], 'a bundle without requirements opts out');
});

const reqDoc = (title) => `---\ntype: Requirement\ntitle: ${title}\ndescription: ${title}.\n---\n\n- AC-1 (integration): holds.\n`;
const cite = (doc, reqs) => doc.replace('---\n\n', `requirements: [${reqs}]\n---\n\n`);
const repo = () => makeRepo({
  'docs/requirements/R-001.md': reqDoc('Platform'),
  'docs/requirements/R-002.md': reqDoc('Standalone services'),
  'docs/intents/I-1-pricing.md': cite(intentDoc('I-1'), 'R-1'),
  'docs/units/U-1-a.md': cite(unitDoc({ scope: ['a/**'] }), 'R-1'),
  'docs/units/U-2-b.md': cite(unitDoc({ scope: ['b/**'] }), 'R-2'),
});

test('U10/AC-2 requirements are approved by ID; an edited one is stale and blocks the units that cite it', () => {
  const dir = repo();
  approve(dir, 'I-1');
  let r = run(dir, ['next']);
  assert.equal(r.code, 2);
  assert.match(r.out, /^👉 ask the owner to approve the plan: aidlc approve U-1 U-2 R-001 R-002 \(the owner confirms the prompt or types: approve U-1 U-2 R-001 R-002\)$/m, 'U39: the plan approval names the draft requirements its units cite');

  approve(dir, 'R-001', 'R-2', 'U-1', 'U-2');
  assert.match(run(dir, ['next']).out, /^build U-1, U-2/);

  commit(dir, 'edit R-2', { 'docs/requirements/R-002.md': read(dir, 'docs/requirements/R-002.md').replace('holds.', 'holds always.') });
  assert.match(run(dir, ['next']).out, /^build U-1 \(/, 'U-1 does not cite R-2, so it builds meanwhile');
  branch(dir, 'U-1', 'a/x.txt');
  write(dir, { '.git/aidlc/heartbeats/U-1': '' });
  r = run(dir, ['next']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /^👉 re-approve R-002 after their edits: aidlc approve R-002/);
});

test('U10/AC-3 status lists requirements no merged unit cites', () => {
  const dir = repo();
  approve(dir, 'I-1', 'R-1', 'R-2', 'U-1', 'U-2');
  assert.match(run(dir, ['status']).out, /^not yet delivered: R-001 R-002$/m);
  branch(dir, 'U-1', 'a/x.txt');
  merge(dir, 'U-1');
  assert.match(run(dir, ['status']).out, /^not yet delivered: R-002$/m);
  branch(dir, 'U-2', 'b/x.txt');
  merge(dir, 'U-2');
  assert.doesNotMatch(run(dir, ['status']).out, /not yet delivered/);
});

test('U10/AC-4 OKF-INDEX allows prose paragraphs, keeps them on regeneration, and fails a malformed entry', () => {
  const spec = join(ROOT, 'tests/fixtures/okf/spec');
  assert.deepEqual(checkBundle(join(spec, 'index-prose')).filter((f) => f.level === 'error'), []);
  const malformed = checkBundle(join(spec, 'OKF-INDEX-entry'), { base: spec }).filter((f) => f.code === 'OKF-INDEX');
  assert.deepEqual(malformed.map((f) => [f.path, f.line]), [['OKF-INDEX-entry/index.md', 5]]);

  const dir = tempDir('prose-');
  cpSync(join(spec, 'index-prose'), dir, { recursive: true });
  const before = readFileSync(join(dir, 'index.md'), 'utf8');
  writeIndexes(dir);
  assert.equal(readFileSync(join(dir, 'index.md'), 'utf8'), before, 'prose survives aidlc index');
  write(dir, { 'b.md': '---\ntype: Note\ntitle: B\ndescription: Another.\n---\n' });
  writeIndexes(dir);
  assert.match(readFileSync(join(dir, 'index.md'), 'utf8'), /^# Note\n\nContext: every concept here is checked by hand\.\nA second prose line\.\n\n\* \[A\]\(a\.md\) - A valid concept\.\n\* \[B\]\(b\.md\) - Another\.\n$/);
});

test('U10/AC-4 U19/AC-3 prose under a heading the new index lacks moves to the top, and an entry keeps its hint', () => {
  const dir = tempDir('prose-');
  write(dir, {
    'a.md': '---\ntype: Design\ntitle: A\ndescription: A design.\n---\n',
    'index.md': '# Architecture\n\nContext map: every Uses line names an Exposes entry.\n\n* [A](a.md) - A design. Load when designing.\n',
  });
  writeIndexes(dir);
  const once = readFileSync(join(dir, 'index.md'), 'utf8');
  assert.equal(once, 'Context map: every Uses line names an Exposes entry.\n\n# Design\n\n* [A](a.md) - A design. Load when designing.\n');
  writeIndexes(dir);
  assert.equal(readFileSync(join(dir, 'index.md'), 'utf8'), once, 'stable on the next run');
});

test('U39/AC-1 the intent approval names the draft requirements the intent cites, so one prompt covers them', () => {
  const dir = repo();
  const r = run(dir, ['next']);
  assert.equal(r.code, 2);
  assert.match(r.out, /^👉 ask the owner to approve I-1 R-001: aidlc approve I-1 R-001 \(the owner confirms the prompt or types: approve I-1 R-001\)$/m);
  approve(dir, 'I-1', 'R-001');
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve the plan: aidlc approve U-1 U-2 R-002 /, 'R-001 is approved; R-002 comes with the units that cite it');
});
