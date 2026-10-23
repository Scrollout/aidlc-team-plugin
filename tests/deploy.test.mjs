import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { approve, branch, commit, git, intentDoc, makeRepo, merge, read, run, unitDoc } from './state-repo.mjs';

const OK = 'node -e "require(\'fs\').writeFileSync(\'ran.txt\', \'x\')"';
const FAIL = 'node -e "console.log(\'image build broke\'); process.exit(3)"';
const record = (dir) => JSON.parse(read(dir, '.git/aidlc/deploys/I-1.json'));

// I-1 with one unit, merged on main, and the given profile.
function merged(profile) {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/units/U-1-u.md': unitDoc({ scope: ['a/**'] }) }, profile);
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1', 'a/x.txt');
  merge(dir, 'U-1');
  return dir;
}

test('U47/AC-1 a merged intent with deploy.check: next names the check and runs nothing; the check records its result with the base', () => {
  const dir = merged({ deploy: { check: [OK] } });
  const next = run(dir, ['next']);
  assert.equal(next.out, 'I-1 is merged: run its deploy check on the base: aidlc deploy check I-1\n');
  assert.equal(next.code, 0, 'the lead runs it');
  assert.ok(!existsSync(join(dir, 'ran.txt')), 'next runs nothing itself');
  const r = run(dir, ['deploy', 'check', 'I-1']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'I-1 check passed\n');
  assert.ok(existsSync(join(dir, 'ran.txt')));
  assert.equal(record(dir).check.ok, true);
  assert.equal(record(dir).check.base, git(dir, 'rev-parse', 'main'));
  assert.equal(run(dir, ['deploy', 'check', 'I-2']).code, 64);
  git(dir, 'switch', '-q', '-c', 'side');
  commit(dir, 'off the base');
  assert.match(run(dir, ['deploy', 'check', 'I-1']).err, /check out main first/);
});

test('U47/AC-2 the release is offered only after a check passed on the current base; a failure names the command and the fix', () => {
  const dir = merged({ deploy: { check: [OK] } });
  run(dir, ['deploy', 'check', 'I-1']);
  assert.match(run(dir, ['next']).out, /^👉 I-1 is merged: release with the owner$/m);
  commit(dir, 'docs on the base', { 'notes.md': 'x\n' });
  assert.match(run(dir, ['next']).out, /^I-1 is merged: run its deploy check on the base/, 'a check on an older base does not count');

  const failing = merged({ deploy: { check: [OK, FAIL] } });
  const r = run(failing, ['deploy', 'check', 'I-1']);
  assert.equal(r.code, 1);
  assert.match(r.out, /^I-1 check failed: node -e .+ exited 3\nimage build broke\n/);
  assert.equal(record(failing).check.command, FAIL);
  const next = run(failing, ['next']);
  assert.equal(next.out, `I-1 deploy check failed on the base: ${FAIL} exited 3; draft a fix: aidlc fix "<what failed>" --scope <globs>\n`);
  assert.equal(next.code, 0);
});

test('U47/AC-2 without deploy.check the release line is the one from before', () => {
  assert.match(run(merged({}), ['next']).out, /^👉 I-1 is merged: release with the owner$/m);
});
