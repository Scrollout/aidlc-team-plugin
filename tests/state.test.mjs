import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { aidlc, approve, branch, commit, git, intentDoc, makeRepo, merge, read, review, run, unitDoc, write } from './state-repo.mjs';
import { parseDoc } from '../plugin/cli/lib/okf.mjs';
import { approval, hashDoc } from '../plugin/cli/lib/state.mjs';

const U = (n) => `docs/units/U-${n}-u${n}.md`;
const I1 = { 'docs/intents/I-1-pricing.md': intentDoc('I-1') };

function heartbeat(dir, unit, ageMs = 0) {
  write(dir, { [`.git/aidlc/heartbeats/${unit}`]: '' });
  const t = (Date.now() - ageMs) / 1000;
  utimesSync(join(aidlc(dir), 'heartbeats', unit), t, t);
}

function report(dir, unit) {
  const r = run(dir, ['report', unit], JSON.stringify({ status: 'done', summary: 'ok' }));
  assert.equal(r.code, 0, r.err);
}

// Everything `next` must never lose: branch tips, runtime files, the working tree.
function snapshot(dir) {
  const files = (sub) => (existsSync(join(aidlc(dir), sub)) ? readdirSync(join(aidlc(dir), sub)).sort() : []);
  return {
    refs: git(dir, 'for-each-ref', '--format=%(refname) %(objectname)'),
    tree: git(dir, 'status', '--porcelain'),
    runtime: ['reports', 'reviews', 'cards'].map(files),
  };
}

test('U4/AC-1 status derives every unit state from docs, branches and trailers, with no state file', () => {
  const dir = makeRepo({
    ...I1,
    [U(1)]: unitDoc({ scope: ['a/**'] }),
    [U(2)]: unitDoc({ scope: ['b/**'], depends: ['U-1'] }),
    [U(3)]: unitDoc({ scope: ['c/**'] }),
    [U(4)]: unitDoc({ scope: ['d/**'] }),
    [U(5)]: unitDoc({ scope: ['e/**'], depends: ['U-4'] }),
    [U(6)]: unitDoc({ scope: ['f/**'] }),
    [U(7)]: unitDoc({ scope: ['g/**'] }),
    [U(8)]: unitDoc({ scope: ['h/**'] }),
    [U(9)]: unitDoc({ scope: ['i/**'] }),
  });
  approve(dir, 'I-1', 'U-1', 'U-2', 'U-3', 'U-5', 'U-6', 'U-7', 'U-8', 'U-9');
  branch(dir, 'U-1', 'a/x.txt');
  merge(dir, 'U-1');
  commit(dir, 'edit U-3', { [U(3)]: read(dir, U(3)).replace('Unit goal.', 'Changed goal.') });
  for (const u of ['U-6', 'U-7', 'U-8', 'U-9']) branch(dir, u, `${u}.txt`);
  report(dir, 'U-7');
  review(dir, 'U-8', 'pass');
  review(dir, 'U-9', 'fix');

  const r = run(dir, ['status']);
  const states = Object.fromEntries([...r.out.matchAll(/^ {2}(U-\d+) (\S+)/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual(states, {
    'U-1': 'merged', 'U-2': 'approved', 'U-3': 'stale', 'U-4': 'draft', 'U-5': 'blocked',
    'U-6': 'building', 'U-7': 'reported', 'U-8': 'reviewed', 'U-9': 'fix',
  });
  assert.match(r.out, /^I-1 approved Pricing$/m);
  assert.match(r.out, /^next: merge U-8/m, 'work that does not wait on the stale U-3 goes first');
  assert.ok(r.out.length <= 1000);
  assert.equal(git(dir, 'status', '--porcelain'), '', 'no state file in the working tree');
});

// Each scenario builds a repo in one state; `next` must return the documented action.
const SCENARIOS = {
  'merge cut off midway': [/^finish the merge of U-1: aidlc merge U-1/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1');
    branch(dir, 'U-1');
    git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'unit/U-1');
  }],
  'stale approval': [/^re-approve U-1 after their edits: aidlc approve U-1/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1');
    commit(dir, 'edit', { [U(1)]: read(dir, U(1)) + '\nMore text.\n' });
  }],
  'elaborating (intent not approved)': [/^ask the owner to approve I-1: aidlc approve I-1/, 2, () => {}],
  'plan pending': [/^ask the owner to approve the plan: aidlc approve U-1 U-2 \(the owner confirms the prompt\)$/, 2, (dir) => approve(dir, 'I-1')],
  reviewed: [/^merge U-1: aidlc merge U-1/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    review(dir, 'U-1', 'pass');
  }],
  escalated: [/^U-1 review escalated: the owner decides/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    review(dir, 'U-1', 'fix');
    review(dir, 'U-1', 'fix');
  }],
  'fix verdict': [/^fix round for U-1: builder/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    review(dir, 'U-1', 'fix');
  }],
  'fix round reported with no new commit': [/^review U-1, focus general/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    review(dir, 'U-1', 'fix');
    report(dir, 'U-1');
  }],
  'fix round in flight': [/^wait for the builders and reviewers of U-1$/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    review(dir, 'U-1', 'fix');
    heartbeat(dir, 'U-1');
  }],
  reported: [/^review U-1, focus general: reviewer on opus \(card: aidlc card U-1\)/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    report(dir, 'U-1');
  }],
  'building, stale heartbeat': [/^restart the builder of U-1 from branch unit\/U-1/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    heartbeat(dir, 'U-1', 5 * 60 * 1000);
  }],
  'building, fresh heartbeat': [/^wait for the builders and reviewers of U-1$/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    heartbeat(dir, 'U-1');
  }],
  'approved, parallel up to disjoint scopes': [/^build U-1, U-3 \(cards: aidlc card U-1, aidlc card U-3\)$/, 0, (dir) => {
    commit(dir, 'third unit', { [U(3)]: unitDoc({ scope: ['c/**'] }), [U(4)]: unitDoc({ scope: ['a/sub/**'] }) });
    approve(dir, 'I-1', 'U-1', 'U-2', 'U-3', 'U-4');
  }],
  'all merged, not tagged': [/^I-1 is merged: release with the owner$/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1', 'a/x.txt');
    merge(dir, 'U-1');
    branch(dir, 'U-2', 'b/x.txt');
    merge(dir, 'U-2');
  }],
  'merged and unreleased, a next intent with work': [/^build U-3 /, 0, (dir) => {
    commit(dir, 'next intent', { 'docs/intents/I-2-p.md': intentDoc('I-2'), [U(3)]: unitDoc({ intent: 'I-2', scope: ['c/**'] }) });
    approve(dir, 'I-1', 'U-1', 'U-2', 'I-2', 'U-3');
    for (const [u, f] of [['U-1', 'a/x.txt'], ['U-2', 'b/x.txt']]) { branch(dir, u, f); merge(dir, u); }
  }],
  released: [/^all intents released/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    for (const [u, f] of [['U-1', 'a/x.txt'], ['U-2', 'b/x.txt']]) { branch(dir, u, f); merge(dir, u); }
    git(dir, 'tag', 'v1');
  }],
};

const base = () => makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'], depends: ['U-1'] }) });

for (const [name, [expect, code, setup]] of Object.entries(SCENARIOS)) {
  test(`U4/AC-2 next: ${name}`, () => {
    const dir = base();
    setup(dir);
    const r = run(dir, ['next']);
    assert.match(r.out.trimEnd(), expect, r.out + r.err);
    assert.equal(r.code, code);
  });
}

test('U4/AC-2 next with no intent asks to elaborate one', () => {
  const r = run(makeRepo(), ['next']);
  assert.match(r.out, /^elaborate an intent with the owner in docs\/intents\/I-1-<slug>\.md/);
  assert.equal(r.code, 2);
});

test('U4/AC-8 a draft with open points sends the lead back to the owner before approvals and unit work', () => {
  const draft = '---\ntype: Intent\ntitle: Export\ndescription: <one sentence>\n---\n\n# Goal\nAdmins get prices weekly.\n\n# Why\n<the reason>\n\n# Out of scope\n- `GET /x?r=<r>` stays as is.\n\n## Open questions\n- Which day?\n';
  const dir = base();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  report(dir, 'U-1');
  commit(dir, 'draft I-2', { 'docs/intents/I-2-export.md': draft });
  let r = run(dir, ['next']);
  assert.equal(r.out.trimEnd(), 'finish elaborating I-2 with the owner: description, Why, Open questions still open in docs/intents/I-2-export.md; then ask for approval');
  assert.equal(r.code, 2);
  write(dir, { 'docs/intents/I-2-export.md': draft.replace('<one sentence>', 'Weekly export.').replace('<the reason>', 'Sales asks.').replace('\n## Open questions\n- Which day?\n', '') });
  r = run(dir, ['next']);
  assert.match(r.out, /^review U-1, focus general/, 'a complete draft no longer holds unit work back');
});

test('U4/AC-6 after a clear, next returns the same action and loses nothing', () => {
  for (const name of ['elaborating (intent not approved)', 'plan pending', 'building, fresh heartbeat', 'building, stale heartbeat', 'reported', 'reviewed', 'merge cut off midway']) {
    const dir = base();
    SCENARIOS[name][2](dir);
    const before = snapshot(dir);
    const first = run(dir, ['next']).out;
    const again = run(dir, ['next']).out; // a fresh process: nothing carried over but disk
    assert.equal(again, first, name);
    assert.deepEqual(snapshot(dir), before, `${name}: next changed state`);
    if (name === 'building, fresh heartbeat') assert.doesNotMatch(first, /^(build|restart)/, 'no duplicate builder');
  }
});

test('U4/AC-3 approve writes the stamp; editing makes it stale; reformatting or a hold does not', () => {
  const dir = base();
  const before = read(dir, U(1));
  assert.equal(run(dir, ['approve', 'U-1']).code, 0);
  const doc = parseDoc(read(dir, U(1)));
  assert.equal(doc.fm.status, 'stable');
  assert.deepEqual(doc.fm.verified.map((e) => e.by), ['human:owner@example.com']);
  assert.match(doc.fm.verified[0].at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(doc.fm.verified_hash, hashDoc(doc));
  assert.equal(approval(doc), 'approved');
  assert.equal(approval(parseDoc(before)), 'draft');

  const edited = parseDoc(read(dir, U(1)).replace('- AC-1 (unit): it works.', '- AC-1 (unit): it works fast.'));
  assert.equal(approval(edited), 'stale');
  const reformatted = parseDoc(read(dir, U(1)).replace('scope: ["a/**"]', 'scope:\n  - a/**'));
  assert.equal(approval(reformatted), 'approved');
  const held = parseDoc(read(dir, U(1)).replace('status: stable', 'status: stable\nhold: true\npriority: 2'));
  assert.equal(approval(held), 'approved');

  write(dir, { [U(1)]: read(dir, U(1)).replace('it works.', 'it works fast.') });
  assert.equal(run(dir, ['approve', 'U-1']).code, 0);
  const twice = parseDoc(read(dir, U(1)));
  assert.equal(twice.fm.verified.length, 2, 'earlier events are kept');
  assert.equal(approval(twice), 'approved');

  assert.equal(run(dir, ['approve', 'docs/units/U-9.md']).code, 64);
  write(dir, { 'docs/note.md': '---\ntype: Note\n---\n' });
  assert.equal(run(dir, ['approve', 'docs/note.md']).code, 64);
});

test('review record turns a second fix into escalate; report needs a JSON object', () => {
  const dir = base();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  review(dir, 'U-1', 'fix');
  review(dir, 'U-1', 'fix');
  const rounds = JSON.parse(read(dir, '.git/aidlc/reviews/U-1.json')).rounds;
  assert.deepEqual(rounds.map((r) => r.verdict), ['fix', 'escalate']);
  assert.equal(run(dir, ['report', 'U-1'], 'not json').code, 64);
  assert.equal(run(dir, ['review', 'record', 'U-9', 'x.json']).code, 64);
});

test('U5/AC-4 an adopted project with no intent is asked for the migration intent', () => {
  const dir = makeRepo({}, { adopted: '0123456789abcdef0123' });
  const r = run(dir, ['next']);
  assert.match(r.out, /^elaborate the migration intent with the owner in docs\/intents\/I-1-<slug>\.md \(adopted at 0123456789ab\)/);
  assert.equal(r.code, 2);
});

test('U8/AC-6 U18/AC-3 re-approving an escalated unit marks its findings answered and sends it to review; the count restarts', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  const finding = { path: 'src/U-1.txt', line: 1, claim: 'wrong level', scenario: 'gate fails', confidence: 'CONFIRMED' };
  review(dir, 'U-1', 'fix', [finding]);
  review(dir, 'U-1', 'fix', [finding]);
  assert.match(run(dir, ['next']).out, /^U-1 review escalated/);
  write(dir, { [U(1)]: read(dir, U(1)).replace('it works.', 'it works at the unit level.') });
  commit(dir, 'owner widens U-1');
  approve(dir, 'U-1');
  assert.match(run(dir, ['next']).out, /^review U-1, focus general/, 'no fix round: the re-review runs directly');
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /## Findings answered by the spec change\n.*\n- general CONFIRMED src\/U-1\.txt:1: wrong level \(gate fails\)$/m);
  assert.doesNotMatch(card, /Findings to fix/);
  review(dir, 'U-1', 'fix', [finding]);
  assert.equal(JSON.parse(read(dir, '.git/aidlc/reviews/U-1.json')).rounds.at(-1).verdict, 'fix', 'the first fix after re-approval');
});

test('U4/AC-2 a stopped builder sends the unit back to the lead; re-approval restarts it', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  run(dir, ['report', 'U-1'], '{"status": "stopped", "stop": "the scope is too small"}');
  const r = run(dir, ['next']);
  assert.match(r.out, /^the builder of U-1 stopped \(the scope is too small\): if the unit doc is wrong, fix it and ask the owner to re-approve it; otherwise remove the cause and start its builder again/);
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
  assert.match(r.out, /^U-1 on hold: the owner releases them/);
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
  assert.match(run(dir, ['next']).out, /^re-approve U-1 after their edits: aidlc approve U-1 \(the owner confirms the prompt\)/);
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
  assert.match(run(dir, ['next']).out, /^ask the owner to approve the plan: aidlc approve U-3 /);
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
  const old = new Date(Date.now() - 10 * 60 * 1000);
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
  assert.match(run(dir, ['next']).out, /^U-1 has no test tagged U-1\/AC-2 on its branch: send the builder back/);
  write(dir, { '.git/aidlc/heartbeats/U-1': '' });
  assert.match(run(dir, ['next']).out, /^wait for the builders and reviewers of U-1/, 'the builder sent back is waited for');
  git(dir, 'switch', '-q', 'unit/U-1');
  commit(dir, 'tag AC-2', { 'src/round.txt': 'U-1/AC-2\n' });
  git(dir, 'switch', '-q', 'main');
  review(dir, 'U-1', 'pass');
  assert.match(run(dir, ['next']).out, /^merge U-1/);
});
