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
  assert.equal(next.out, `I-1 deploy check failed on the base: ${FAIL} exited 3; draft a fix: aidlc fix "<what failed>" --after I-1 --scope <globs>\n`);
  assert.equal(next.code, 0);
});

test('U48/AC-2 an intent the owner tagged before deploy was added stays released', () => {
  const dir = merged({});
  git(dir, 'tag', 'v1');
  commit(dir, 'deploy added', { '.aidlc/profile.json': { deploy: { check: [OK], run: OK } } });
  assert.match(run(dir, ['status']).out, /^I-1 released /m);
  assert.doesNotMatch(run(dir, ['next']).out, /deploy check/);
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
  assert.match(run(dir, ['status']).out, /^I-1 released /m, 'the recorded release decides');

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
  assert.equal(guard(dir, 'S=$(date +%s); node .aidlc/bin/aidlc.mjs release I-1 2>&1 | tail -20'), 'none', 'the go lets it through, redirect and all');
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs release I-1'), 'ask', 'once');
  hook(dir, 'prompt', { prompt: 'release I-1' });
  commit(dir, 'a later commit');
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs release I-1'), 'ask', 'a go is for the commit it was typed at');
  assert.equal(hook(dir, 'prompt', { prompt: 'please release I-1' }).trim(), '{}', 'only the exact words');
});

test('U49/AC-1 after a passing release aidlc release runs deploy.smoke; a pass marks the intent released and the record keeps the output', () => {
  const dir = merged({ deploy: { run: OK, smoke: 'node -e "console.log(\'health ok\')"' } });
  const r = run(dir, ['release', 'I-1']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'I-1 release passed\nI-1 smoke passed\n');
  assert.equal(record(dir).smoke.output, 'health ok');
  assert.match(run(dir, ['status']).out, /^I-1 released /m);
});

test('U49/AC-2 a failed smoke is a stop before other work: the owner rolls back, then a fix unit after the intent, then the check again', () => {
  const smoke = 'node -e "require(\'fs\').existsSync(\'fixed.txt\') || (console.log(\'503 on /health\'), process.exit(4))"';
  const dir = merged({ deploy: { check: [OK], run: OK, smoke, rollback: mark('rolled.txt') } });
  commit(dir, 'next intent', { 'docs/intents/I-2-n.md': intentDoc('I-2', 'Next'), 'docs/units/U-2-n.md': unitDoc({ intent: 'I-2', scope: ['b/**'] }) });
  approve(dir, 'I-2', 'U-2');
  run(dir, ['deploy', 'check', 'I-1']);
  const r = run(dir, ['release', 'I-1']);
  assert.equal(r.code, 1);
  assert.match(r.out, /^I-1 release passed\nI-1 smoke failed: .+ exited 4\n503 on \/health\n/);
  assert.match(run(dir, ['status']).out, /^I-1 merged /m, 'not released');
  let next = run(dir, ['next']);
  assert.match(next.out, /^⛔ I-1 smoke failed: .+ exited 4; the owner rolls back: aidlc rollback I-1 \(the owner confirms the prompt or types: rollback I-1\)$/m, 'before building U-2');
  assert.equal(next.code, 2);
  assert.equal(guard(dir, 'node .aidlc/bin/aidlc.mjs rollback I-1'), 'ask', 'the owner\'s command');

  assert.equal(run(dir, ['rollback', 'I-1']).out, 'I-1 rollback passed\n');
  assert.ok(existsSync(join(dir, 'rolled.txt')));
  next = run(dir, ['next']);
  assert.equal(next.out, 'I-1 was rolled back: draft a fix from the smoke output in .git/aidlc/deploys/I-1.json: aidlc fix "<what failed>" --after I-1 --scope <globs>\n');
  const fix = run(dir, ['fix', 'health check fails after release', '--after', 'I-1', '--scope', 'docs/**']);
  assert.equal(fix.code, 0, fix.err);
  const unit = fix.out.match(/wrote (\S+?),/)[1];
  assert.match(read(dir, unit), /^after: I-1$/m);
  commit(dir, 'fix unit', { 'fixed.txt': 'x\n' });
  assert.equal(run(dir, ['next']).out, 'build U-2 (cards: aidlc card U-2)\n', 'the rolled-back release no longer holds back other work');
  assert.match(run(dir, ['release', 'I-1']).err, /no passing deploy check on this base/, 'the base moved: check and release again');
  run(dir, ['deploy', 'check', 'I-1']);
  assert.equal(run(dir, ['release', 'I-1']).code, 0);
  assert.match(run(dir, ['status']).out, /^I-1 released /m);
});

test('U51/AC-1 the retro lists each failed deploy check, smoke and rollback of the intent, with the fix units they started', () => {
  const dir = merged({ deploy: { check: [FAIL], run: OK, smoke: FAIL, rollback: FAIL } });
  assert.equal(run(dir, ['retro', 'I-1']).code, 0, 'a first retro resets the counters');
  run(dir, ['deploy', 'check', 'I-1']);
  commit(dir, 'the check passes now', { '.aidlc/profile.json': { deploy: { check: [OK], run: OK, smoke: FAIL, rollback: FAIL } } });
  run(dir, ['deploy', 'check', 'I-1']);
  run(dir, ['release', 'I-1']);
  run(dir, ['rollback', 'I-1']);
  run(dir, ['fix', 'health check fails after release', '--after', 'I-1', '--scope', 'docs/**']);
  const r = run(dir, ['retro', 'I-1']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('deploy failures:\n')[1].split('proposals')[0].trimEnd().split('\n');
  assert.deepEqual(lines.map((l) => l.replace(/ at \S+:/, ' at <t>:')), [
    `  check failed at <t>: ${FAIL}`,
    `  smoke failed at <t>: ${FAIL}`,
    `  rollback failed at <t>: ${FAIL}`,
    '  fix units after I-1: U-2',
  ]);
  assert.match(run(dir, ['retro', 'I-1']).out, /^deploy failures:\n {2}fix units after I-1: U-2\n/m, 'the counters reset; the fix units stay in the plan');
});
