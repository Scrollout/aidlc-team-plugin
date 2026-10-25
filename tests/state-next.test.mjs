import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { aidlc, approve, branch, commit, git, heartbeat, I1, intentDoc, makeRepo, merge, read, report, review, run, tempDir, twoUnits, U, unitDoc, write } from './state-repo.mjs';
import { approval } from '../plugin/cli/lib/state.mjs';

test('U4/AC-2 a stopped builder sends the unit back to the lead; re-approval restarts it', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  run(dir, ['report', 'U-1'], '{"status": "stopped", "stop": "the scope is too small"}');
  const r = run(dir, ['next']);
  assert.match(r.out, /^⛔ the builder of U-1 stopped \(the scope is too small\): if the unit doc is wrong, fix it and ask the owner to re-approve it; otherwise remove the cause and start its builder again/);
  assert.equal(r.code, 0);
  write(dir, { [U(1)]: read(dir, U(1)).replace('src/**', 'src/**", "lib/**') });
  commit(dir, 'widen U-1');
  approve(dir, 'U-1');
  assert.match(run(dir, ['next']).out, /^restart the builder of U-1/);
});

test('U4/AC-2 a delegated re-approval of a stopped unit restarts its builder too', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  run(dir, ['report', 'U-1'], '{"status": "stopped", "stop": "AC-1 is ambiguous"}');
  write(dir, { [U(1)]: read(dir, U(1)) + '\n# Out of scope\n- Error pages.\n', '.aidlc/local/profile.json': { approvals: { auto: ['reapprove'] } } });
  commit(dir, 'clarify the scope');
  assert.equal(run(dir, ['approve', '--auto', 'U-1']).code, 0);
  assert.match(run(dir, ['next']).out, /^restart the builder of U-1/);
});

test('U4/AC-2 hold and priority record the owner\'s word in the plan without staling it', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'] }) }, { parallel: { max: 1 } });
  approve(dir, 'I-1', 'U-1', 'U-2');
  assert.match(run(dir, ['next']).out, /^build U-1 /);
  assert.equal(run(dir, ['priority', 'U-2', '5']).code, 0);
  assert.match(read(dir, U(2)), /^priority: 5$/m);
  assert.match(run(dir, ['next']).out, /^build U-2 /);
  run(dir, ['hold', 'U-2']);
  assert.match(run(dir, ['next']).out, /^build U-1 /);
  run(dir, ['hold', 'U-2', 'off']);
  assert.doesNotMatch(read(dir, U(2)), /^hold:/m);
  assert.match(run(dir, ['status']).out, /U-2 approved/, 'neither field stales the approval');
  assert.equal(run(dir, ['priority', 'U-2', 'high']).code, 64);
});

test('U4/AC-2 a hold also holds a reviewed unit\'s merge', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^merge U-1/);
  run(dir, ['hold', 'U-1']);
  const r = run(dir, ['next']);
  assert.match(r.out, /^👉 U-1 on hold: the owner releases them/);
  assert.equal(r.code, 2);
});

test('U3/AC-3 check skips merged units in plan lint, as next does', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  merge(dir, 'U-1');
  commit(dir, 'U-2 overlaps the merged U-1', { [U(2)]: unitDoc({ scope: ['src/b/**'] }) });
  assert.doesNotMatch(run(dir, ['check']).out, /PLAN-SCOPE/);
});

test('U4/AC-3 delegated approvals: the lead re-approves and approves quick units only when the personal profile says so', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }), [U(2)]: unitDoc({ scope: ['docs/guide/**'] }) }, { lanes: { quick: ['docs/**'] } });
  approve(dir, 'I-1', 'U-1');
  write(dir, { [U(1)]: read(dir, U(1)).replace('Unit goal.', 'Unit goal, said better.') });
  commit(dir, 'edit U-1');
  assert.match(run(dir, ['next']).out, /^👉 re-approve U-1 after their edits: aidlc approve U-1 \(the owner confirms the prompt or types: approve U-1\)/);
  assert.equal(run(dir, ['approve', '--auto', 'U-1']).code, 64, 'nothing delegated yet');

  write(dir, { '.aidlc/local/profile.json': { approvals: { auto: ['reapprove', 'quick'] } } });
  const r = run(dir, ['next']);
  assert.match(r.out, /^approve U-1, delegated by the owner: aidlc approve --auto U-1/);
  assert.equal(r.code, 0, 'an action, not an owner gate');
  assert.equal(run(dir, ['approve', '--auto', 'U-1']).code, 0);
  assert.match(read(dir, U(1)), /by: process:delegated/);
  commit(dir, 're-approve U-1');
  assert.match(run(dir, ['next']).out, /^approve U-2, delegated by the owner: aidlc approve --auto U-2/, 'a quick-lane draft');
  assert.equal(run(dir, ['approve', '--auto', 'U-2']).code, 0);
  assert.match(run(dir, ['status']).out, /U-2 approved/);

  commit(dir, 'a standard draft', { [U(3)]: unitDoc({ scope: ['lib/**'] }) });
  assert.equal(run(dir, ['approve', '--auto', 'U-3']).code, 64, 'a first approval of a standard unit is never delegated');
  assert.match(run(dir, ['next']).out, /^build U-1, U-2 /, 'the approved units build while the owner has U-3 to approve');
  for (const u of ['U-1', 'U-2']) { branch(dir, u, `${u}.txt`); heartbeat(dir, u); }
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve the plan: aidlc approve U-3 /);
});

test('U4/AC-1 a unit whose dependencies are unmerged is blocked, even with a branch from an earlier run', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'], depends: ['U-1'] }) });
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-2', 'b/x.txt');
  assert.match(run(dir, ['status']).out, /U-2 blocked/);
  assert.match(run(dir, ['next']).out, /^build U-1 /);
});

test('U4/AC-6 a review in flight makes next wait instead of asking for it again', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  run(dir, ['report', 'U-1'], '{"status": "done"}');
  assert.match(run(dir, ['next']).out, /^review U-1, focus general/);
  write(dir, { '.git/aidlc/reviewing/U-1': '' });
  assert.match(run(dir, ['next']).out, /^wait for the builders and reviewers of U-1/);
  const old = new Date(Date.now() - 13 * 60 * 1000);
  utimesSync(join(dir, '.git/aidlc/reviewing/U-1'), old, old);
  assert.match(run(dir, ['next']).out, /^review U-1, focus general/, 'a reviewer that went quiet is started again');
  write(dir, { '.git/aidlc/reviewing/U-1': '' });
  run(dir, ['review', 'record', 'U-1', '-'], '{"verdict": "pass", "findings": []}');
  assert.doesNotMatch(run(dir, ['next']).out, /^wait/, 'a recorded verdict ends the review in flight');
});

test('U4/AC-3 delegate writes the owner\'s delegation into the personal profile only', () => {
  const dir = makeRepo({ ...I1 });
  assert.equal(run(dir, ['delegate', 'everything']).code, 64);
  assert.equal(run(dir, ['delegate', 'reapprove', 'quick']).code, 0);
  assert.deepEqual(JSON.parse(read(dir, '.aidlc/local/profile.json')).approvals.auto, ['reapprove', 'quick']);
  run(dir, ['delegate', 'off']);
  assert.deepEqual(JSON.parse(read(dir, '.aidlc/local/profile.json')).approvals.auto, []);
  assert.doesNotMatch(read(dir, '.aidlc/profile.json'), /approvals/);
});

test('U18/AC-2 next offers a merge only when each AC has a tagged test on the branch, outside the bundle', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**', 'docs/notes/**'], acs: ['- AC-1 (unit): it works.', '- AC-2 (unit): it rounds.'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  git(dir, 'switch', '-q', 'unit/U-1');
  commit(dir, 'a note naming the tag', { 'docs/notes/n.md': 'see U-1/AC-2\n' });
  git(dir, 'switch', '-q', 'main');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^fix round for U-1/, 'a note in the bundle is no test: the pass is recorded as fix (U32)');
  write(dir, { '.git/aidlc/heartbeats/U-1': '', '.git/aidlc/launches/U-1': '' });
  assert.match(run(dir, ['next']).out, /^wait for the builders and reviewers of U-1/, 'the builder sent back is waited for');
  git(dir, 'switch', '-q', 'unit/U-1');
  commit(dir, 'tag AC-2', { 'src/round.txt': 'U-1/AC-2\n' });
  git(dir, 'switch', '-q', 'main');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^merge U-1/);
});

test('U20/AC-3 a builder still holding a merged unit\'s worktree is named: stop it and remove the worktree', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  merge(dir, 'U-1');
  const tree = join(tempDir('builder-'), 'wt');
  git(dir, 'worktree', 'add', '-q', tree, 'unit/U-1');
  const r = run(dir, ['next']);
  assert.equal(r.code, 0, 'the lead\'s step');
  assert.match(r.out, /^U-1 is merged but .+wt still holds unit\/U-1: stop its builder, then git worktree remove --force --force .+wt and git branch -D unit\/U-1/);
  git(dir, 'worktree', 'remove', '--force', tree);
  assert.doesNotMatch(run(dir, ['next']).out, /still holds/);
});

test('U24/AC-3 every owner step names the words to type, an escalation included, and no message offers a ! command', () => {
  const texts = (o) => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(texts) : []);
  const all = [...texts(JSON.parse(readFileSync(join(import.meta.dirname, '../plugin/cli/cli.json'), 'utf8'))), readFileSync(join(import.meta.dirname, '../plugin/hooks/run.mjs'), 'utf8')];
  assert.deepEqual(all.filter((t) => /(^|[\s:`])! ?node\b/.test(t)), [], 'no ! command');
  const dir = twoUnits();
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve I-1: aidlc approve I-1 \(the owner confirms the prompt or types: approve I-1\)/);
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  for (let k = 0; k < 4; k++) review(dir, 'U-1', 'fix');
  assert.match(run(dir, ['next']).out, /^👉 U-1 review escalated: the owner decides\. To keep the spec: aidlc approve U-1 \(the owner confirms the prompt or types: approve U-1\); or change the spec first/);
});

test('U31/AC-1 U31/AC-2 owner steps start with the owner badge, refusals and stops with the stop badge, the lead\'s steps with none', () => {
  const { badges } = JSON.parse(readFileSync(join(import.meta.dirname, '../plugin/cli/cli.json'), 'utf8')).state;
  assert.notEqual(badges.owner.trim(), badges.stop.trim(), 'two different symbols');
  const dir = twoUnits();
  assert.ok(run(dir, ['next']).out.startsWith(badges.owner), 'approve I-1 is the owner\'s');
  approve(dir, 'I-1', 'U-1', 'U-2');
  assert.match(run(dir, ['next']).out, /^build U-1/, 'the lead\'s step carries no badge');
  branch(dir, 'U-1');
  run(dir, ['report', 'U-1'], '{"status": "stopped", "stop": "scope too small"}');
  assert.ok(run(dir, ['next']).out.startsWith(badges.stop), 'a stop');
  const skill = readFileSync(join(import.meta.dirname, '../plugin/skills/aidlc/SKILL.md'), 'utf8');
  assert.match(skill, /End the turn with their step alone, last: its badge \(👉 or ⛔, no other\) and \*\*Your action\*\*, numbered steps, the words to type in code\. Nothing for them: end with ✅\./);
});

test('U32/AC-1 U32/AC-2 U32/AC-3 a pass with an untagged AC is recorded as fix and the card names it; the retro lists the send-back', () => {
  const dir = twoUnits();
  approve(dir, 'I-1', 'U-1', 'U-2');
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'code, no tagged test', { 'a/x.txt': 'x\n' });
  git(dir, 'switch', '-q', 'main');
  const f = join(tempDir('verdict-'), 'v.json');
  writeFileSync(f, JSON.stringify({ verdict: 'pass', findings: [] }));
  const r = run(dir, ['review', 'record', 'U-1', f]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^recorded fix for U-1: no test is tagged U-1\/AC-1 on its branch, so it cannot pass \(fix round 1 of 3\)$/m);
  assert.equal(JSON.parse(read(dir, '.git/aidlc/reviews/U-1.json')).rounds.at(-1).verdict, 'fix');
  assert.match(run(dir, ['next']).out, /^fix round for U-1/);
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /## Findings to fix[\s\S]*U-1\/AC-1 has no tagged test on the branch/);
  const retro = run(dir, ['retro', 'I-1']).out;
  assert.match(retro, /^ {2}U-1 sent back at \S+: no test tagged U-1\/AC-1$/m);
});

test('U93/AC-1 the gate counts a verdict only when newer than the last report, as next does', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }) });
  approve(dir, 'I-1', 'U-1');
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'work', { 'a/x.txt': 'U-1/AC-1\n' });
  git(dir, 'switch', '-q', 'main');
  report(dir, 'U-1');
  review(dir, 'U-1', 'pass');
  report(dir, 'U-1'); // a new report, the diff unchanged
  assert.match(run(dir, ['next']).out, /^review U-1, focus general/);
  assert.match(run(dir, ['merge', 'U-1']).out, /GATE-REVIEW no pass verdict for the current diff and last report of U-1/);
  review(dir, 'U-1', 'pass');
  assert.doesNotMatch(run(dir, ['merge', 'U-1']).out, /GATE-REVIEW/);
});

test('U34/AC-1 U34/AC-2 each round records its commit; a focus pass outlives a fix its globs did not see, general does not', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**', 'sec/**'] }) }, { focus: { security: ['sec/**'] } });
  approve(dir, 'I-1', 'U-1');
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'work', { 'a/x.txt': 'U-1/AC-1\n', 'sec/y.txt': 'y\n' });
  const fixRound = (file) => {
    git(dir, 'switch', '-q', 'unit/U-1');
    commit(dir, `fix ${file}`, { [file]: `${file} fixed\n` });
    git(dir, 'switch', '-q', 'main');
    report(dir, 'U-1');
  };
  git(dir, 'switch', '-q', 'main');
  review(dir, 'U-1', 'pass');
  run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify({ verdict: 'pass', focus: 'security', findings: [] }));
  const rounds = () => JSON.parse(read(dir, '.git/aidlc/reviews/U-1.json')).rounds;
  assert.deepEqual(rounds().map((r) => r.commit), Array(2).fill(git(dir, 'rev-parse', 'unit/U-1')));
  review(dir, 'U-1', 'fix');
  fixRound('a/z.txt');
  assert.match(run(dir, ['next']).out, /^review U-1, focus general/, 'general reviews the fix');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^merge U-1/, 'the security pass is kept: the fix touched no security glob');
  assert.doesNotMatch(run(dir, ['merge', 'U-1']).out, /GATE-SPECIALIST|GATE-REVIEW/);
  review(dir, 'U-1', 'fix');
  fixRound('sec/z.txt');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^review U-1, focus security/, 'a fix inside the focus globs is reviewed again');
  assert.match(run(dir, ['merge', 'U-1']).out, /GATE-SPECIALIST/);
});

test('U75/AC-2 an added line matching security.content requires the security focus; a fix adding another reviews it again', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }) }, { security: { content: ['BYPASSRLS'] } });
  approve(dir, 'I-1', 'U-1');
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'work', { 'a/x.txt': 'U-1/AC-1\n', 'a/role.sql': 'ALTER ROLE app bypassrls;\n' });
  git(dir, 'switch', '-q', 'main');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^review U-1, focus security/, 'outside every focus glob, the content still asks for it');
  assert.match(run(dir, ['merge', 'U-1']).out, /GATE-SPECIALIST security review required \(a\/role\.sql:1 matches security\.content BYPASSRLS\)/);
  run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify({ verdict: 'pass', focus: 'security', findings: [] }));
  const fixRound = (text) => {
    review(dir, 'U-1', 'fix');
    git(dir, 'switch', '-q', 'unit/U-1');
    commit(dir, 'fix', { 'a/x.txt': `U-1/AC-1 ${text}\n` });
    git(dir, 'switch', '-q', 'main');
    report(dir, 'U-1');
    review(dir, 'U-1', 'pass');
  };
  fixRound('plain');
  assert.match(run(dir, ['next']).out, /^merge U-1/, 'a fix with no matching line keeps the security pass');
  fixRound('BYPASSRLS again');
  assert.match(run(dir, ['next']).out, /^review U-1, focus security/);
});

test('U35/AC-1 a pass carrying a CONFIRMED finding is recorded as fix and says why; PLAUSIBLE findings stay notes on a pass', () => {
  const dir = twoUnits();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  const finding = (confidence) => ({ path: 'a/x', line: 1, claim: `${confidence} claim`, scenario: 's', confidence });
  const record = (findings) => run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify({ verdict: 'pass', findings }));
  const last = () => JSON.parse(read(dir, '.git/aidlc/reviews/U-1.json')).rounds.at(-1);
  let r = record([finding('PLAUSIBLE')]);
  assert.match(r.out, /^recorded pass for U-1$/m);
  assert.deepEqual([last().verdict, last().findings.length], ['pass', 1]);
  r = record([finding('CONFIRMED'), finding('PLAUSIBLE')]);
  assert.match(r.out, /^recorded fix for U-1: a pass cannot carry a CONFIRMED finding \(1 sent\), so the builder fixes it \(fix round 1 of 3\)$/m);
  assert.deepEqual([last().verdict, last().findings.length], ['fix', 2]);
  assert.match(run(dir, ['card', 'U-1']).out, /## Findings to fix[\s\S]*CONFIRMED a\/x:1: CONFIRMED claim/);
});

test('U37/AC-2 U37/AC-3 approve refuses a unit at a one-way door with no decision; the plan approval names the linked decision', () => {
  const door = { lanes: { full: ['migrations/**'] } };
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['migrations/**'] }) }, door);
  approve(dir, 'I-1');
  const r = run(dir, ['approve', 'U-1']);
  assert.equal(r.code, 64);
  assert.match(r.err, /PLAN-DECISION U-1 touches the one-way door migrations\/\*\* through scope \S+ and links no decision → link a Decision doc/);
  commit(dir, 'decide', {
    'docs/decisions/0001-keep.md': '---\ntype: Decision\ntitle: 0001 Keep\ndescription: Keep it.\n---\n\n# Decision\nKeep.\n',
    [U(1)]: read(dir, U(1)) + '\n# Logical\n- [Keep](../decisions/0001-keep.md)\n',
  });
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve the plan: aidlc approve U-1 docs\/decisions\/0001-keep\.md/);
  approve(dir, 'U-1', 'docs/decisions/0001-keep.md');
});

test('U38/AC-1 a reviewer escalate within review.fixRounds is recorded as fix and says why; past the limit it stays escalate', () => {
  const dir = twoUnits();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  const record = (verdict) => run(dir, ['review', 'record', 'U-1', '-'], JSON.stringify({ verdict, findings: [{ path: 'a/x', line: 1, claim: 'the card cannot be met', scenario: 's', confidence: 'CONFIRMED' }] })).out;
  assert.match(record('escalate'), /^recorded fix for U-1: a reviewer escalate is a fix round first \(fix round 1 of 3\); the builder fixes it or stops on its card's stop conditions$/m);
  assert.match(run(dir, ['next']).out, /^fix round for U-1/);
  record('fix');
  record('escalate');
  assert.match(record('escalate'), /^recorded escalate for U-1: fix round 4/m);
  assert.deepEqual(JSON.parse(read(dir, '.git/aidlc/reviews/U-1.json')).rounds.map((r) => r.verdict), ['fix', 'fix', 'fix', 'escalate']);
});

test('0.46.1 next offers no delegated re-approval for a unit whose acceptance criteria changed: the owner approves it', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  write(dir, { '.aidlc/local/profile.json': { approvals: { auto: ['reapprove'] } } });
  commit(dir, 'add AC-2', { [U(1)]: read(dir, U(1)).replace('- AC-1 (unit): it works.', '- AC-1 (unit): it works.\n- AC-2 (unit): it also rounds.') });
  const r = run(dir, ['next']);
  assert.match(r.out, /^👉 re-approve U-1 after their edits: aidlc approve U-1 /);
  assert.equal(r.code, 2);
});

test('U41/AC-2 status shows the clear while every intent is released and nothing is in flight', () => {
  const dir = twoUnits();
  approve(dir, 'I-1', 'U-1', 'U-2');
  for (const [u, f] of [['U-1', 'a/x.txt'], ['U-2', 'b/x.txt']]) { branch(dir, u, f); merge(dir, u); }
  assert.doesNotMatch(run(dir, ['status']).out, /\/clear/, 'merged, not yet released');
  git(dir, 'tag', 'v1');
  assert.match(run(dir, ['status']).out, /^next: 👉 all intents released: the owner clears the lead's session/m);
});

test('U45/AC-1 after a clear newer than the last merge, next asks to elaborate the next intent, not for the clear again', () => {
  const dir = twoUnits();
  approve(dir, 'I-1', 'U-1', 'U-2');
  for (const [u, f] of [['U-1', 'a/x.txt'], ['U-2', 'b/x.txt']]) { branch(dir, u, f); merge(dir, u); }
  git(dir, 'tag', 'v1');
  write(dir, { '.git/aidlc/cleared': '' });
  const old = new Date(Date.now() - 3600 * 1000);
  utimesSync(join(aidlc(dir), 'cleared'), old, old);
  assert.match(run(dir, ['next']).out, /^👉 all intents released: the owner clears the lead's session/, 'a clear before the last merge does not count');
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '../plugin/cli/aidlc.mjs'), 'hook', 'status'], { cwd: dir, encoding: 'utf8', input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart', source: 'clear' }) });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /next: 👉 all intents released and the lead's session is fresh: elaborate the next intent with the owner/);
  assert.match(run(dir, ['next']).out, /^👉 all intents released and the lead's session is fresh: elaborate the next intent with the owner/);
});

test('U65/AC-2 status and the session-start hook show the same units: merged units of a released intent are history', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'], intent: null }) });
  approve(dir, 'I-1', 'U-1', 'U-2');
  for (const [u, f] of [['U-1', 'a/x.txt'], ['U-2', 'b/x.txt']]) { branch(dir, u, f); merge(dir, u); }
  git(dir, 'tag', 'v1');
  const units = (text) => [...text.matchAll(/^ {2}(U-\d+) (\S+)/gm)].map((m) => `${m[1]} ${m[2]}`);
  const status = run(dir, ['status']).out;
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '../plugin/cli/aidlc.mjs'), 'hook', 'status'], { cwd: dir, encoding: 'utf8', input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart', source: 'startup' }) });
  const context = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(status, /^I-1 released /m);
  assert.deepEqual(units(status), ['U-2 merged'], 'U-1 belongs to the released I-1');
  assert.deepEqual(units(context), units(status));
});

test('U101/AC-1 the draft decisions an approved intent links come before its units: finish, then approve', () => {
  const D = 'docs/decisions/0002-language.md';
  const intent = intentDoc('I-1').replace('# Goal', 'Language: [0002](../decisions/0002-language.md).\n\n# Goal');
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intent, [D]: '---\ntype: Decision\ntitle: 0002 Language\ndescription: Which language.\n---\n\n# Decision\n<the option chosen>\n' });
  approve(dir, 'I-1');
  assert.match(run(dir, ['next']).out, /^finish docs\/decisions\/0002-language\.md, which I-1 links, with the owner before its units: Decision/);
  write(dir, { [D]: read(dir, D).replace('<the option chosen>', 'Go, by the owner.') });
  const ask = run(dir, ['next']);
  assert.equal(ask.code, 2, 'the owner acts');
  assert.match(ask.out, /ask the owner to approve the decisions I-1 links before its units: aidlc approve docs\/decisions\/0002-language\.md/);
  assert.equal(run(dir, ['approve', D]).code, 0);
  assert.match(run(dir, ['next']).out, /^draft the units of I-1/);
});
