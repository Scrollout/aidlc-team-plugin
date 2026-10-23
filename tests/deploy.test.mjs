import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { approve, branch, CLI, commit, git, intentDoc, makeRepo, merge, read, run, unitDoc } from './state-repo.mjs';

const OK = 'node -e "require(\'fs\').writeFileSync(\'ran.txt\', \'x\')"';
const FAIL = 'node -e "console.log(\'image build broke\'); process.exit(3)"';
const mark = (file) => `node -e "require('fs').writeFileSync('${file}', 'x')"`;
const hook = (dir, name, input) => spawnSync(process.execPath, [CLI, 'hook', name], { cwd: dir, encoding: 'utf8', input: JSON.stringify({ session_id: 's', cwd: dir, ...input }) }).stdout;
const guard = (dir, command, mode = 'auto') => JSON.parse(hook(dir, 'guard', { tool_name: 'Bash', permission_mode: mode, tool_input: { command } })).hookSpecificOutput?.permissionDecision ?? 'none';
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
  assert.match(run(dir, ['next']).out, /^👉 I-1 is ready to release: the owner releases it/m);
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

test('U48/AC-1 aidlc release runs deploy.run and then release, records each exit, and is an owner command', () => {
  const dir = merged({ deploy: { check: [OK], run: mark('deployed.txt') }, release: mark('released.txt') });
  assert.match(run(dir, ['release', 'I-1']).err, /I-1 has no passing deploy check on this base: run aidlc deploy check I-1 first/);
  run(dir, ['deploy', 'check', 'I-1']);
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs release I-1'), 'ask', 'the guard asks the owner');
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs release I-1', 'bypassPermissions'), 'deny');
  const r = run(dir, ['release', 'I-1']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'I-1 release passed\n');
  assert.ok(existsSync(join(dir, 'deployed.txt')) && existsSync(join(dir, 'released.txt')));
  assert.equal(record(dir).release.ok, true);
  assert.match(run(dir, ['status']).out, /^I-1 released /m, 'the recorded release decides, not a tag');

  const failing = merged({ deploy: { run: FAIL }, release: mark('released.txt') });
  assert.equal(run(failing, ['release', 'I-1']).code, 1);
  assert.ok(!existsSync(join(failing, 'released.txt')), 'release runs only after deploy.run passed');
  assert.deepEqual([record(failing).release.command, record(failing).release.exit], [FAIL, 3]);
  const next = run(failing, ['next']);
  assert.match(next.out, /^⛔ I-1 release failed: node -e .+ exited 3; the owner retries \(the owner types: release I-1\), or the lead drafts a fix: aidlc fix/);
  assert.equal(next.code, 2);
});

test('U48/AC-2 the release line names the words to type; typed words give a go the guard uses once', () => {
  const dir = merged({ release: mark('released.txt') });
  const next = run(dir, ['next']);
  assert.equal(next.out, '👉 I-1 is ready to release: the owner releases it: aidlc release I-1 (the owner confirms the prompt or types: release I-1)\n');
  assert.equal(next.code, 2);
  const typed = JSON.parse(hook(dir, 'prompt', { prompt: '  Release i-1 ' })).hookSpecificOutput.additionalContext;
  assert.equal(typed, 'The owner typed release I-1: run aidlc release I-1 now; the guard lets this one call through.');
  assert.ok(!existsSync(join(dir, 'released.txt')), 'the hook only records the go');
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs rollback I-1'), 'none', 'not an owner command yet');
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs release I-1'), 'none', 'the go lets it through');
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs release I-1'), 'ask', 'once');
  hook(dir, 'prompt', { prompt: 'release I-1' });
  commit(dir, 'a later commit');
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs release I-1'), 'ask', 'a go is for the commit it was typed at');
  assert.equal(hook(dir, 'prompt', { prompt: 'please release I-1' }).trim(), '{}', 'only the exact words');
});
