import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, commit, git, intentDoc, makeRepo, read, review, run, tempDir, unitDoc, write } from './state-repo.mjs';
import { CODE, codes, FAIL, LOG, merge, PROFILE, setup, TEST, U1 } from './gate-repo.mjs';

const VACUOUS = { 'tests/add.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert';\ntest('U-1/AC-1 adds', () => assert.ok(true));\n" };

test('U28/AC-1 a tagged test that still passes with the change reverted refuses the merge; the merge keeps the change', () => {
  const vacuous = setup({ files: { ...CODE, ...VACUOUS } });
  const r = merge(vacuous);
  assert.equal(r.code, 1);
  assert.match(r.out, /GATE-PROOF level unit still passes with U-1's changes outside the test paths reverted: its tagged tests do not test them → make each tagged test fail without the change, then report again/);
  assert.equal(git(vacuous, 'rev-list', '--merges', 'main'), '', 'nothing merged');
  const fixing = setup({ beforeReview: (d) => {
    commit(d, 'a buggy add on the base', { 'src/add.mjs': 'export const add = (a, b) => a - b;\n' });
    git(d, 'switch', '-q', 'unit/U-1'); git(d, 'merge', '-q', '--no-edit', '-X', 'ours', 'main'); git(d, 'switch', '-q', 'main');
  } });
  const ok = merge(fixing);
  assert.equal(ok.code, 0, ok.out);
  assert.equal(read(fixing, 'src/add.mjs'), CODE['src/add.mjs'], 'the reverted file is restored before the commit');
  assert.match(git(fixing, 'log', '-1', '--format=%(trailers:only,unfold)'), /^Proof: unit$/m);
  assert.equal(git(fixing, 'status', '--porcelain'), '');
});

test('U28/AC-2 U28/AC-3 a quick-lane or run-less unit skips the proof and says so; a test-only one needs mutations (U56); the card and builder name it', () => {
  assert.match(merge(setup({ files: VACUOUS })).out, /GATE-PROOF U-1\/AC-1 has no mutation that applies/);
  const quick = setup({ unit: { scope: ['docs/guide/**'], modules: [] }, files: { 'docs/guide/a.md': '---\ntype: Note\ntitle: A\ndescription: A note.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\nText.\n' } });
  assert.match(merge(quick).out, /^proof skipped: quick lane$/m);
  const runless = setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'] } } } });
  assert.match(merge(runless).out, /^proof skipped: no level run holds a tagged test$/m);
  const card = run(setup(), ['card', 'U-1']).out;
  assert.match(card, /^The merge gate reverts your changes outside the test paths of unit and reruns those levels: each one holding a tagged test must then fail\.$/m);
  assert.match(readFileSync(join(import.meta.dirname, '../plugin/agents/builder.md'), 'utf8'), /The merge gate checks this: it reverts your code and reruns the levels of your tagged tests, and a test that still passes refuses the merge\./);
});

test('U28/AC-1 a run that checks git diff is not fooled by the revert', () => {
  const profile = { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: 'node --test && git diff --exit-code' } } };
  const r = merge(setup({ profile, files: { ...CODE, ...VACUOUS } }));
  assert.match(r.out, /GATE-PROOF level unit still passes/, r.out);
  const ok = setup({ profile });
  const m = merge(ok);
  assert.equal(m.code, 0, m.out);
  assert.equal(read(ok, 'src/add.mjs'), CODE['src/add.mjs']);
  assert.equal(git(ok, 'status', '--porcelain'), '');
});

test('U44/AC-1 U44/AC-2 a level that needs an unset variable fails before it runs; a skip in a level or proof-revert run fails as GATE-SKIP', () => {
  const needs = setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: 'node --test', needs: ['AIDLC_TEST_UNSET_DB'] } } } });
  const r = merge(needs);
  assert.equal(r.code, 1);
  assert.match(r.out, /GATE-RUN .*level unit needs AIDLC_TEST_UNSET_DB, which is unset: its tests would skip/);
  // A runner that reports a skip only once the unit's code is reverted: the level run passes, proof-revert skips.
  const probe = 'node -e "if (!require(\'fs\').existsSync(\'src/add.mjs\')) console.log(\'SKIP: no code to test\')"';
  const skipped = setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: probe, skip: '^SKIP:' } } } });
  const s = merge(skipped);
  assert.equal(s.code, 1, s.out);
  assert.match(s.out, /GATE-SKIP .*level unit skipped a test: SKIP: no code to test/);
  assert.doesNotMatch(s.out, /GATE-PROOF/, 'a skip is reported as a skip, not as a test that still passes');
});

test('U46/AC-1 after a merge a locked builder worktree with clean tracked files is removed; one with uncommitted tracked changes is kept and named', () => {
  const dir = setup();
  const wt = join(tempDir('wt-'), 'w');
  git(dir, 'worktree', 'add', '-q', wt, 'unit/U-1');
  git(dir, 'worktree', 'lock', '--reason', 'claude agent', wt);
  write(wt, { 'build.log': 'untracked scratch\n' });
  const r = merge(dir);
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(!existsSync(wt), 'removed despite the lock and an untracked log');
  assert.doesNotMatch(r.out, /kept/);

  const dirty = setup();
  const wt2 = join(tempDir('wt-'), 'w');
  git(dirty, 'worktree', 'add', '-q', wt2, 'unit/U-1');
  write(wt2, { 'src/add.mjs': 'export const add = (a, b) => a - b;\n' });
  const k = merge(dirty);
  assert.equal(k.code, 0, k.out + k.err);
  assert.ok(existsSync(wt2), 'uncommitted tracked work is never thrown away');
  assert.match(k.out, /^kept .+: it has uncommitted changes to tracked files$/m);
});

// U-1 adds only a test for src/add.mjs, which the base already has, and reports the given mutations.
function backfill({ test = TEST, mutations } = {}) {
  const dir = makeRepo({ ...LOG, ...CODE, 'docs/intents/I-1-math.md': intentDoc('I-1', 'Math'), [U1]: unitDoc({ scope: ['tests/**'], acs: ['- AC-1 (unit): adds two numbers.'] }) }, PROFILE);
  approve(dir, 'I-1', 'U-1');
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'characterize add', test);
  if (mutations) assert.equal(run(dir, ['report', 'U-1'], JSON.stringify({ status: 'done', summary: 's', tests: [], mutations })).code, 0);
  git(dir, 'switch', '-q', 'main');
  assert.equal(run(dir, ['card', 'U-1']).code, 0);
  review(dir, 'U-1', 'pass');
  return dir;
}
const BREAK = [{ ac: 'U-1/AC-1', path: 'src/add.mjs', find: 'a + b', replace: 'a - b', breaks: 'adding' }];

test('U56/AC-1 U57/AC-2 a back-fill unit merges when each mutation fails its AC\'s level, and is refused when one still passes', () => {
  const dir = backfill({ mutations: BREAK });
  const r = merge(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(git(dir, 'log', '-1', '--format=%(trailers:only,unfold)'), /^Proof: mutation unit$/m);
  assert.match(r.out, /^proof: U-1\/AC-1's mutation of src\/add\.mjs failed level unit$/m, 'U57/AC-2 each mutation\'s result');
  assert.equal(read(dir, 'src/add.mjs'), CODE['src/add.mjs'], 'the mutated file is restored');
  assert.equal(git(dir, 'status', '--porcelain'), '');

  const vacuous = backfill({ test: VACUOUS, mutations: BREAK });
  const refused = merge(vacuous);
  assert.equal(refused.code, 1);
  assert.match(refused.out, /GATE-PROOF level unit still passes with U-1\/AC-1's mutation applied: its test does not catch the break/);
});

test('U56/AC-2 an AC without a mutation, or one whose find no longer matches once, refuses as GATE-PROOF', () => {
  assert.match(merge(backfill()).out, /GATE-PROOF U-1\/AC-1 has no mutation that applies: its find text must occur once in its file on the merge result/);
  const moved = backfill({ mutations: BREAK });
  commit(moved, 'the base changes add', { 'src/add.mjs': 'export const add = (x, y) => x + y;\n' });
  assert.match(merge(moved).out, /GATE-PROOF U-1\/AC-1 has no mutation that applies/);
});

test('U60/AC-1 a quick-lane merge runs no level; other lanes still run every level', () => {
  const profile = { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: FAIL } } };
  const quick = setup({ profile, unit: { scope: ['docs/guide/**'], modules: [] }, files: { 'docs/guide/a.md': '---\ntype: Note\ntitle: A\ndescription: A note.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\nText.\n' } });
  const r = merge(quick);
  assert.equal(r.code, 0, r.out);
  assert.match(git(quick, 'log', '-1', '--format=%(trailers:only,unfold)'), /^Tested: none$/m);
  assert.deepEqual(codes(merge(setup({ profile }))), ['GATE-RUN'], 'a standard unit still runs the failing level');
});
