import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aidlc, approve, branch, commit, git, intentDoc, makeRepo, merge, read, review, run, tempDir, unitDoc, write } from './state-repo.mjs';
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
  'stale approval': [/^👉 re-approve U-1 after their edits: aidlc approve U-1/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1');
    commit(dir, 'edit', { [U(1)]: read(dir, U(1)) + '\nMore text.\n' });
  }],
  'elaborating (intent not approved)': [/^👉 ask the owner to approve I-1: aidlc approve I-1/, 2, () => {}],
  'plan pending': [/^👉 ask the owner to approve the plan: aidlc approve U-1 U-2 \(the owner confirms the prompt or types: approve U-1 U-2\)$/, 2, (dir) => approve(dir, 'I-1')],
  reviewed: [/^merge U-1: aidlc merge U-1/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    review(dir, 'U-1', 'pass');
  }],
  escalated: [/^👉 U-1 review escalated: the owner decides/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    for (let k = 0; k < 4; k++) review(dir, 'U-1', 'fix');
  }],
  'fix verdict': [/^fix round for U-1: builder/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    review(dir, 'U-1', 'fix');
  }],
  '0.46.2 fix verdict while the last builder\'s heartbeat is fresh': [/^fix round for U-1: builder/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    heartbeat(dir, 'U-1'); // the builder that reported before the review touched it minutes ago
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
    write(dir, { '.git/aidlc/launches/U-1': '' }); // the model hook launched the fix-round builder
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
    heartbeat(dir, 'U-1', 13 * 60 * 1000);
  }],
  'U36/AC-3 building, heartbeat 10 min old (a long test run)': [/^wait for the builders and reviewers of U-1$/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    heartbeat(dir, 'U-1', 10 * 60 * 1000);
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
  'all merged, not tagged': [/^👉 I-1 is merged: release with the owner$/, 2, (dir) => {
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
  released: [/^👉 all intents released/, 2, (dir) => {
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
  assert.match(r.out, /^👉 elaborate an intent with the owner in docs\/intents\/I-1-<slug>\.md/);
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
  assert.equal(r.out.trimEnd(), '👉 finish elaborating I-2 with the owner: description, Why, Open questions still open in docs/intents/I-2-export.md; then ask for approval');
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

test('U33/AC-1 review record turns the fix past review.fixRounds (default 3) into escalate, per focus; report needs a JSON object', () => {
  const dir = base();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  for (let k = 0; k < 4; k++) review(dir, 'U-1', 'fix');
  const rounds = JSON.parse(read(dir, '.git/aidlc/reviews/U-1.json')).rounds;
  assert.deepEqual(rounds.map((r) => r.verdict), ['fix', 'fix', 'fix', 'escalate']);
  const one = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }) }, { review: { fixRounds: 1 } });
  approve(one, 'I-1', 'U-1');
  branch(one, 'U-1');
  review(one, 'U-1', 'fix');
  review(one, 'U-1', 'fix');
  assert.deepEqual(JSON.parse(read(one, '.git/aidlc/reviews/U-1.json')).rounds.map((r) => r.verdict), ['fix', 'escalate'], 'the profile sets the limit');
  assert.equal(run(dir, ['report', 'U-1'], 'not json').code, 64);
  assert.equal(run(dir, ['review', 'record', 'U-9', 'x.json']).code, 64);
});

test('U26/AC-1 U26/AC-2 U33/AC-2 a fix recorded as escalate tells the reviewer why; the card heads the owner\'s answer as a re-approval', () => {
  const dir = base();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  const verdict = (v) => { const f = join(tempDir('verdict-'), 'v.json'); writeFileSync(f, JSON.stringify({ verdict: v, findings: [{ path: 'a/x', line: 1, claim: 'c', scenario: 's', confidence: 'CONFIRMED' }] })); return run(dir, ['review', 'record', 'U-1', f]).out; };
  for (const k of [1, 2, 3]) assert.match(verdict('fix'), new RegExp(`^recorded fix for U-1: fix round ${k} of 3 in focus general$`, 'm'));
  assert.match(verdict('fix'), /^recorded escalate for U-1: fix round 4 in focus general would pass the limit of 3 since the owner's last approval, so the owner decides$/m);
  approve(dir, 'U-1');
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /^## Findings the owner answered by re-approving\nThe owner kept or changed the spec after these escalated; report each again only if it still holds against the spec as it is now\.$/m);
});

test('U5/AC-4 an adopted project with no intent is asked for the migration intent', () => {
  const dir = makeRepo({}, { adopted: '0123456789abcdef0123' });
  const r = run(dir, ['next']);
  assert.match(r.out, /^👉 elaborate the migration intent with the owner in docs\/intents\/I-1-<slug>\.md \(adopted at 0123456789ab\)/);
  assert.equal(r.code, 2);
});

test('U8/AC-6 U18/AC-3 re-approving an escalated unit marks its findings answered and sends it to review; the count restarts', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  branch(dir, 'U-1');
  const finding = { path: 'src/U-1.txt', line: 1, claim: 'wrong level', scenario: 'gate fails', confidence: 'CONFIRMED' };
  for (let k = 0; k < 4; k++) review(dir, 'U-1', 'fix', [finding]);
  assert.match(run(dir, ['next']).out, /^👉 U-1 review escalated/);
  write(dir, { [U(1)]: read(dir, U(1)).replace('it works.', 'it works at the unit level.') });
  commit(dir, 'owner widens U-1');
  approve(dir, 'U-1');
  assert.match(run(dir, ['next']).out, /^review U-1, focus general/, 'no fix round: the re-review runs directly');
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /## Findings the owner answered by re-approving\n.*\n- general CONFIRMED src\/U-1\.txt:1: wrong level \(gate fails\)$/m);
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
  const dir = base();
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve I-1: aidlc approve I-1 \(the owner confirms the prompt or types: approve I-1\)/);
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  for (let k = 0; k < 4; k++) review(dir, 'U-1', 'fix');
  assert.match(run(dir, ['next']).out, /^👉 U-1 review escalated: the owner decides\. To keep the spec: aidlc approve U-1 \(the owner confirms the prompt or types: approve U-1\); or change the spec first/);
});

test('U31/AC-1 U31/AC-2 owner steps start with the owner badge, refusals and stops with the stop badge, the lead\'s steps with none', () => {
  const { badges } = JSON.parse(readFileSync(join(import.meta.dirname, '../plugin/cli/cli.json'), 'utf8')).state;
  assert.notEqual(badges.owner.trim(), badges.stop.trim(), 'two different symbols');
  const dir = base();
  assert.ok(run(dir, ['next']).out.startsWith(badges.owner), 'approve I-1 is the owner\'s');
  approve(dir, 'I-1', 'U-1', 'U-2');
  assert.match(run(dir, ['next']).out, /^build U-1/, 'the lead\'s step carries no badge');
  branch(dir, 'U-1');
  run(dir, ['report', 'U-1'], '{"status": "stopped", "stop": "scope too small"}');
  assert.ok(run(dir, ['next']).out.startsWith(badges.stop), 'a stop');
  const skill = readFileSync(join(import.meta.dirname, '../plugin/skills/aidlc/SKILL.md'), 'utf8');
  assert.match(skill, /End the turn with their step alone, last: the line's badge and \*\*Your action\*\*, numbered steps, the words to type in code\. Nothing for them: end with ✅\./);
});

test('U32/AC-1 U32/AC-2 U32/AC-3 a pass with an untagged AC is recorded as fix and the card names it; the retro lists the send-back', () => {
  const dir = base();
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

test('U35/AC-1 a pass carrying a CONFIRMED finding is recorded as fix and says why; PLAUSIBLE findings stay notes on a pass', () => {
  const dir = base();
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
  assert.match(r.err, /PLAN-DECISION U-1 touches the one-way door migrations\/\*\* and links no decision → link a Decision doc/);
  commit(dir, 'decide', {
    'docs/decisions/0001-keep.md': '---\ntype: Decision\ntitle: 0001 Keep\ndescription: Keep it.\n---\n\n# Decision\nKeep.\n',
    [U(1)]: read(dir, U(1)) + '\n# Logical\n- [Keep](../decisions/0001-keep.md)\n',
  });
  assert.match(run(dir, ['next']).out, /^👉 ask the owner to approve the plan: aidlc approve U-1 docs\/decisions\/0001-keep\.md/);
  approve(dir, 'U-1', 'docs/decisions/0001-keep.md');
});

test('U38/AC-1 a reviewer escalate within review.fixRounds is recorded as fix and says why; past the limit it stays escalate', () => {
  const dir = base();
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
