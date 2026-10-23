import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { approve, branch, commit, intentDoc, makeRepo, read, review, run, unitDoc, write } from './state-repo.mjs';

const RUN = join(import.meta.dirname, '..', 'plugin/hooks/run.mjs');
const U = (n) => `docs/units/U-${n}-u${n}.md`;
const I1 = { 'docs/intents/I-1-pricing.md': intentDoc('I-1') };

function project(docs, profile) {
  const dir = makeRepo({ ...I1, ...docs, '.gitignore': '.aidlc/local/\n' }, profile); // as init writes it
  assert.equal(run(dir, ['upgrade', '--dirty']).code, 0);
  commit(dir, 'pin the CLI');
  return dir;
}
function hook(name, input) {
  const r = spawnSync(process.execPath, [RUN, name], { input: JSON.stringify({ session_id: 's1', ...input }), encoding: 'utf8' });
  return r.stdout.trim() ? JSON.parse(r.stdout) : {};
}
const live = (dir, unit) => write(dir, { [`.git/aidlc/heartbeats/${unit}`]: '' });
const steer = (dir) => hook('steer', { cwd: dir, hook_event_name: 'Stop', last_assistant_message: 'Done.' }).decision ?? 'allow';

test('U15/AC-1 an owner gate holds back only the units that wait on its docs', () => {
  const dir = project({ [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'] }), [U(3)]: unitDoc({ scope: ['c/**'], depends: ['U-2'] }) });
  approve(dir, 'I-1', 'U-1', 'U-2', 'U-3');
  commit(dir, 'edit U-2', { [U(2)]: read(dir, U(2)).replace('Unit goal.', 'Unit goal, sharper.') });
  let r = run(dir, ['next']);
  assert.equal(r.out, 'build U-1 (cards: aidlc card U-1)\n', 'U-1 builds while the owner re-approves U-2; U-3 depends on U-2');
  branch(dir, 'U-1', 'a/x.txt');
  live(dir, 'U-1');
  r = run(dir, ['next']);
  assert.equal(r.code, 2);
  assert.match(r.out, /^👉 re-approve U-2 after their edits/);
});

test('U15/AC-2 the guard records an owner prompt, and the PostToolUse hook marks it ran', () => {
  const dir = project({ [U(1)]: unitDoc({ scope: ['a/**'] }) });
  const ask = hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'node .aidlc/bin/aidlc.mjs approve I-1 U-1' } });
  assert.equal(ask.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(run(dir, ['status']).out, /^owner prompt: approve I-1 U-1 \(asked /m);
  hook('heartbeat', { cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't1', tool_input: {} });
  assert.match(run(dir, ['status']).out, /^owner prompt: approve I-1 U-1 \(ran /m);
  const ctx = hook('status', { cwd: dir, hook_event_name: 'SessionStart', source: 'clear' }).hookSpecificOutput.additionalContext;
  assert.match(ctx, /^owner prompt: approve I-1 U-1 \(ran /, 'after a clear the lead sees the owner answered');
});

test('U15/AC-3 a builder launched after a stop report takes over; a unit the lead parks gets no action', () => {
  const dir = project({ [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'] }) }, { parallel: { max: 2 } });
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1', 'a/x.txt');
  run(dir, ['report', 'U-1'], '{"status": "stopped", "stop": "scope too small"}');
  assert.match(run(dir, ['next']).out, /^⛔ the builder of U-1 stopped/);
  live(dir, 'U-1');
  assert.match(run(dir, ['status']).out, /U-1 building/);
  assert.doesNotMatch(run(dir, ['next']).out, /stopped/, 'steer no longer pushes the old stop');
  assert.equal(run(dir, ['hold', 'U-1', 'asked the owner about the branch move']).code, 0);
  commit(dir, 'park U-1');
  assert.match(run(dir, ['next']).out, /^build U-2 /, 'the parked unit holds nothing else back');
  branch(dir, 'U-2', 'b/x.txt');
  live(dir, 'U-2');
  run(dir, ['report', 'U-2'], '{"status": "stopped", "stop": "x"}');
  run(dir, ['hold', 'U-2', 'waits on the owner too']);
  for (const u of ['U-1', 'U-2']) rmSync(join(dir, '.git/aidlc/heartbeats', u)); // nothing runs while they are parked
  assert.match(run(dir, ['next']).out, /^👉 U-1 \(asked the owner about the branch move\), U-2 \(waits on the owner too\) on hold/);
  assert.equal(steer(dir), 'allow', 'steer does not push a parked step');
});

test('U15/AC-4 the owner run mode lives in the personal profile, survives a clear and sets steer\'s stopping point', () => {
  const dir = project({ [U(1)]: unitDoc({ scope: ['a/**'] }) });
  approve(dir, 'I-1', 'U-1');
  const ask = hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node .aidlc/bin/aidlc.mjs mode unattended --stop merge' } });
  assert.equal(ask.hookSpecificOutput.permissionDecision, 'ask', 'mode is an owner command');
  assert.equal(run(dir, ['mode', 'unattended', '--stop', 'merge', '--report', 'plugin-session']).code, 0);
  assert.equal(run(dir, ['mode', 'unattended', '--stop', 'lunch']).code, 64);
  assert.deepEqual(JSON.parse(read(dir, '.aidlc/local/profile.json')).run, { mode: 'unattended', stop: 'merge', report: 'plugin-session' });
  const ctx = hook('status', { cwd: dir, hook_event_name: 'SessionStart', source: 'clear' }).hookSpecificOutput.additionalContext;
  assert.match(ctx, /^run: unattended, stop at merge, report to plugin-session$/m);
  assert.equal(steer(dir), 'block', 'build U-1 is not the stopping point');
  branch(dir, 'U-1', 'a/x.txt');
  run(dir, ['report', 'U-1'], '{"status": "done", "summary": "ok"}');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^merge U-1/);
  assert.equal(steer(dir), 'allow', 'the owner said to stop at the merge');
  assert.equal(run(dir, ['mode', 'off']).code, 0);
  assert.equal(steer(dir), 'block');
});

test('U15/AC-5 next asks for the draft decisions a unit cites, with the unit', () => {
  const decision = '---\ntype: Decision\ntitle: 0001 Currency\ndescription: Prices carry a currency.\n---\n\n# Decision\nAdd it.\n';
  const dir = project({ [U(1)]: unitDoc({ scope: ['a/**'], extra: '\n# Interfaces\n- [Currency](../decisions/0001-currency.md)\n' }), 'docs/decisions/0001-currency.md': decision });
  approve(dir, 'I-1');
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve the plan: aidlc approve U-1 docs\/decisions\/0001-currency\.md /);
  approve(dir, 'U-1', 'docs/decisions/0001-currency.md');
  commit(dir, 'edit U-1', { [U(1)]: read(dir, U(1)).replace('Unit goal.', 'Unit goal again.') });
  assert.match(run(dir, ['next']).out, /^👉 re-approve U-1 after/, 'an approved decision is not asked again');
});

test('U15/AC-6 a delegated re-approval refuses a change to the acceptance criteria', () => {
  const dir = project({ [U(1)]: unitDoc({ scope: ['a/**'] }) });
  approve(dir, 'I-1', 'U-1');
  write(dir, { '.aidlc/local/profile.json': { approvals: { auto: ['reapprove'] } } });
  commit(dir, 'change AC-1', { [U(1)]: read(dir, U(1)).replace('it works.', 'it works offline.') });
  const r = run(dir, ['approve', '--auto', 'U-1']);
  assert.equal(r.code, 64);
  assert.match(r.err, /U-1 changes its acceptance criteria: the owner approves it/);
  commit(dir, 'restore AC-1, edit the goal', { [U(1)]: read(dir, U(1)).replace('it works offline.', 'it works.').replace('Unit goal.', 'Unit goal, sharper.') });
  assert.equal(run(dir, ['approve', '--auto', 'U-1']).code, 0);
});

test('U15/AC-7 MODEL-MISMATCH names where the expected model comes from; the card prints the reviewer model', () => {
  const dir = project({ [U(1)]: unitDoc({ scope: ['a/**'] }) });
  approve(dir, 'I-1', 'U-1');
  const card = run(dir, ['card', 'U-1']);
  assert.match(read(dir, '.git/aidlc/cards/U-1.json') + card.out, /./);
  const reviewer = hook('model', { cwd: dir, tool_name: 'Agent', tool_input: { subagent_type: 'team:reviewer', prompt: 'Review U-1.', model: 'sonnet' } });
  assert.match(reviewer.hookSpecificOutput.permissionDecisionReason, /uses sonnet, the profile's models\.review says opus/);
});
