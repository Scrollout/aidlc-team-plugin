import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, commit, git, intentDoc, makeRepo, run, unitDoc } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const PROFILE = { levels: { unit: { paths: ['tests/**'], run: 'node -e "process.exit(0)"' } } };

// U-1 adds only a test for src/calc.txt, which the base already has.
function backfill({ scope = ['tests/**'], extra = {}, profile = PROFILE } = {}) {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/units/U-1-u.md': unitDoc({ scope }), 'src/calc.txt': 'total = a + b\nlabel = "a + b"\n' }, profile);
  approve(dir, 'I-1', 'U-1');
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'characterize calc', { 'tests/calc.test.txt': 'U-1/AC-1 total is a + b\n', ...extra });
  return dir;
}
const report = (dir, mutations) => run(dir, ['report', 'U-1'], JSON.stringify({ status: 'done', summary: 's', tests: ['tests/calc.test.txt: U-1/AC-1'], ...(mutations ? { mutations } : {}) }));

test('U55/AC-1 a unit that changes only tests reports one mutation per AC of a file outside the tests and the diff, found once', () => {
  const dir = backfill();
  let r = report(dir);
  assert.equal(r.code, 64);
  assert.match(r.err, /a unit that changes only tests proves each AC with a mutation of the code it covers .*U-1\/AC-1 has no mutation/);
  r = report(dir, [{ ac: 'U-1/AC-1', path: 'src/calc.txt', find: 'a + b', replace: 'a - b' }]);
  assert.match(r.err, /U-1\/AC-1's mutation of src\/calc\.txt needs .* \(found 2\)/, 'the find text must point at one place');
  r = report(dir, [{ ac: 'U-1/AC-1', path: 'tests/calc.test.txt', find: 'total is', replace: 'x' }]);
  assert.equal(r.code, 64, 'a test file is no covered code');
  r = report(dir, [{ ac: 'U-1/AC-1', path: 'src/calc.txt', find: 'total = a + b', replace: 'total = a - b' }]);
  assert.equal(r.code, 0, r.err);
  assert.equal(run(dir, ['report', 'U-1'], '{"status": "stopped", "stop": "x"}').code, 0, 'a stop needs none');
});

test('U55/AC-1 a unit that changes code, or one in the quick lane, needs no mutation', () => {
  assert.equal(report(backfill({ scope: ['tests/**', 'src/**'], extra: { 'src/calc.txt': 'total = a + b + 0\n' } })).code, 0);
  assert.equal(report(backfill({ profile: { ...PROFILE, lanes: { quick: ['tests/**'] } } })).code, 0);
});

test('U55/AC-2 the card says how to list mutations and shows the reported ones; the prompts say who writes and who judges them', () => {
  const dir = backfill();
  git(dir, 'switch', '-q', 'main');
  let card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /^If you changed only tests, add "mutations": \[\{"ac": "U-1\/AC-<k>"/m);
  assert.doesNotMatch(card, /Mutations to judge/);
  git(dir, 'switch', '-q', 'unit/U-1');
  report(dir, [{ ac: 'U-1/AC-1', path: 'src/calc.txt', find: 'total = a + b', replace: 'total = a - b' }]);
  git(dir, 'switch', '-q', 'main');
  card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /^## Mutations to judge .*\n- U-1\/AC-1: in src\/calc\.txt, "total = a \+ b" → "total = a - b"$/m);
  assert.match(readFileSync(join(ROOT, 'plugin/agents/builder.md'), 'utf8'), /changed only tests \(a back-fill\), add the card's `mutations`/);
  assert.match(readFileSync(join(ROOT, 'plugin/agents/reviewer.md'), 'utf8'), /`Mutations to judge`: one that breaks nothing its AC names is a `fix` finding/);
});
