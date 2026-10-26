import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { aidlc, approve, branch, commit, git, heartbeat, I1, intentDoc, makeRepo, merge, read, report, review, run, tempDir, twoUnits, U, unitDoc, write } from './state-repo.mjs';
import { parseDoc } from '../plugin/cli/lib/okf.mjs';
import { approval, hashDoc } from '../plugin/cli/lib/state.mjs';

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
  'U41/AC-1 released': [/^👉 all intents released: the owner clears the lead's session before the next intent \(the owner types: \/clear\); everything done is on disk\. Then elaborate the next intent with the owner/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    for (const [u, f] of [['U-1', 'a/x.txt'], ['U-2', 'b/x.txt']]) { branch(dir, u, f); merge(dir, u); }
    git(dir, 'tag', 'v1');
  }],
};


for (const [name, [expect, code, setup]] of Object.entries(SCENARIOS)) {
  test(`U4/AC-2 next: ${name}`, () => {
    const dir = twoUnits();
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
  const dir = twoUnits();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  report(dir, 'U-1');
  commit(dir, 'draft I-2', { 'docs/intents/I-2-export.md': draft });
  let r = run(dir, ['next']);
  assert.equal(r.out.trimEnd(), '👉 finish elaborating I-2 with the owner: description, Why, Open questions still open in docs/intents/I-2-export.md; meanwhile draft the decisions it needs from .aidlc/templates/docs/decision.md, linked from it, so the owner sees the how with the what; then ask for approval', 'U139/AC-1 an intent with no decision drafts them while the owner answers');
  assert.equal(r.code, 2);
  write(dir, { 'docs/intents/I-2-export.md': draft.replace('<one sentence>', 'Weekly export.').replace('<the reason>', 'Sales asks.').replace('\n## Open questions\n- Which day?\n', '') });
  r = run(dir, ['next']);
  assert.match(r.out, /^review U-1, focus general/, 'a complete draft no longer holds unit work back');
});

test('U4/AC-6 after a clear, next returns the same action and loses nothing', () => {
  for (const name of ['elaborating (intent not approved)', 'plan pending', 'building, fresh heartbeat', 'building, stale heartbeat', 'reported', 'reviewed', 'merge cut off midway']) {
    const dir = twoUnits();
    SCENARIOS[name][2](dir);
    const before = snapshot(dir);
    const first = run(dir, ['next']).out;
    const again = run(dir, ['next']).out; // a fresh process: nothing carried over but disk
    assert.equal(again, first, name);
    assert.deepEqual(snapshot(dir), before, `${name}: next changed state`);
    if (name === 'building, fresh heartbeat') assert.doesNotMatch(first, /^(build|restart)/, 'no duplicate builder');
  }
});

test('U92/AC-2 approve refuses a doc its stamps would take over the project\'s cap, naming how much to trim', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U(1)]: unitDoc({ scope: ['a/**'], extra: 'x'.repeat(200) }) }, { docs: { caps: { Unit: 0 } } });
  const size = [...read(dir, U(1))].length;
  write(dir, { '.aidlc/profile.json': JSON.stringify({ docs: { caps: { Unit: size + 10 } } }) });
  const r = run(dir, ['approve', 'U-1']);
  assert.equal(r.code, 64, r.out);
  assert.match(r.err, new RegExp(`docs/units/U-1\\S*\\.md would be \\d+ chars with its approval stamps, over its ${size + 10} cap: trim it by \\d+ or more`));
  assert.equal(approval(parseDoc(read(dir, U(1)))), 'draft', 'nothing written');
  write(dir, { '.aidlc/profile.json': JSON.stringify({ docs: { caps: { default: size + 1000 } } }) });
  assert.equal(run(dir, ['approve', 'U-1']).code, 0, 'a default cap counts for every type');
});

test('U113/AC-1 U113/AC-3 approve writes nothing when one doc is refused and stamps a doc named twice once; next names a shared decision number by file', () => {
  const dec = (title) => `---\ntype: Decision\ntitle: ${title}\ndescription: D.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\n# Decision\nUse X.\n`;
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ id: 'U-2', scope: ['b/**'], extra: 'x'.repeat(200) }),
    'docs/decisions/0001-a.md': dec('A'), 'docs/decisions/0001-a-detail.md': dec('A detail'), 'docs/decisions/0002-b.md': dec('B') });
  const size = [...read(dir, U(2))].length;
  write(dir, { '.aidlc/profile.json': JSON.stringify({ docs: { caps: { Unit: size + 10 } } }) });
  const before = read(dir, U(1));
  assert.equal(run(dir, ['approve', 'U-1', 'U-2']).code, 64, 'U-2 is over once stamped');
  assert.equal(read(dir, U(1)), before, 'nothing written');
  write(dir, { '.aidlc/profile.json': '{}' });
  assert.equal(run(dir, ['approve', 'U-1', 'U-1', 'docs/decisions/0001-a-detail.md', '0002', '0002']).code, 0);
  assert.equal(parseDoc(read(dir, U(1))).fm.verified.length, 1);
  assert.equal(parseDoc(read(dir, 'docs/decisions/0002-b.md')).fm.verified.length, 1);
  const decs = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/decisions/0001-a.md': dec('A'), 'docs/decisions/0001-a-detail.md': dec('A detail'), 'docs/decisions/0002-b.md': dec('B') });
  assert.equal(run(decs, ['approve', 'I-1', 'docs/decisions/0001-a-detail.md', '0002']).code, 0);
  for (const f of ['docs/decisions/0001-a-detail.md', 'docs/decisions/0002-b.md']) write(decs, { [f]: read(decs, f).replace('Use X.', 'Use Y.') });
  const next = run(decs, ['next']).out;
  assert.match(next, /0001-a-detail/, 'a shared number: by file name');
  assert.match(next, /\b0002\b/);
  assert.doesNotMatch(next, /\b0001 /);
});

test('U110/AC-1 check warns HOUSE-SIZE on an unapproved doc its stamps would take over its cap, with the trim approve names', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U(1)]: unitDoc({ scope: ['a/**'], extra: 'x'.repeat(200) }) }, { docs: { caps: { Unit: 0 } } });
  const size = [...read(dir, U(1))].length;
  write(dir, { '.aidlc/profile.json': JSON.stringify({ docs: { caps: { Unit: size + 10 } } }) });
  const stamps = (r) => r.out.split('\n').filter((l) => /HOUSE-SIZE/.test(l) && /approval stamps/.test(l));
  const r = run(dir, ['check']);
  assert.equal(stamps(r).length, 1, r.out);
  assert.match(stamps(r)[0], /^docs\/units\/U-1\S*\.md:1 /);
  const trim = stamps(r)[0].match(/trim (\d+) or more/)[1];
  assert.match(run(dir, ['approve', 'U-1']).err, new RegExp(`trim it by ${trim} or more`), 'check and approve count the same');
  assert.equal(stamps(run(dir, ['check', U(1)])).length, 1, 'a file path checks that doc');
  write(dir, { '.aidlc/profile.json': JSON.stringify({ docs: { caps: { Unit: size + 1000 } } }) });
  assert.equal(run(dir, ['approve', 'U-1']).code, 0);
  write(dir, { '.aidlc/profile.json': JSON.stringify({ docs: { caps: { Unit: size + 10 } } }) });
  assert.equal(stamps(run(dir, ['check'])).length, 0, 'an approved doc needs no headroom');
});

test('U4/AC-3 approve writes the stamp; editing makes it stale; reformatting or a hold does not', () => {
  const dir = twoUnits();
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

  write(dir, { [U(1)]: read(dir, U(1)).replace('it works.', 'it works fast.').replace('verified:\n', 'verified:\n  - { by: human:other@example.com, at: 2026-01-01T00:00:00.000Z }\n') });
  assert.equal(run(dir, ['approve', 'U-1']).code, 0);
  const twice = parseDoc(read(dir, U(1)));
  assert.deepEqual(twice.fm.verified.map((e) => e.by), ['human:other@example.com', 'human:owner@example.com'], 'U113/AC-2 one stamp per approver: the own one replaced, the others kept');
  assert.notEqual(twice.fm.verified[1].at, doc.fm.verified[0].at);
  assert.equal(approval(twice), 'approved');

  assert.equal(run(dir, ['approve', 'docs/units/U-9.md']).code, 64);
  write(dir, { 'docs/note.md': '---\ntype: Note\n---\n' });
  assert.equal(run(dir, ['approve', 'docs/note.md']).code, 64);
});

test('U33/AC-1 review record turns the fix past review.fixRounds (default 3) into escalate, per focus; report needs a JSON object', () => {
  const dir = twoUnits();
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
  const dir = twoUnits();
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  const verdict = (v) => { run(dir, ['report', 'U-1'], '{"status": "done"}'); const f = join(tempDir('verdict-'), 'v.json'); writeFileSync(f, JSON.stringify({ verdict: v, findings: [{ path: 'a/x', line: 1, claim: 'c', scenario: 's', confidence: 'CONFIRMED' }] })); return run(dir, ['review', 'record', 'U-1', f]).out; }; // the builder reports before each review (U133)
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

test('U80/AC-2 approve finds a decision by its number, as the owner types it', () => {
  const dir = makeRepo({ ...I1, 'docs/decisions/0010-baseline.md': '---\ntype: Decision\ntitle: 0010 Baseline\ndescription: Edges.\n---\n\n# Decision\nKeep.\n', 'docs/notes/0010-other.md': '---\ntype: Note\ntitle: N\ndescription: N.\n---\n\nText.\n' });
  for (const name of ['0010', '10']) {
    const r = run(dir, ['approve', name]);
    assert.equal(r.code, 0, r.err);
    assert.equal(parseDoc(read(dir, 'docs/decisions/0010-baseline.md')).fm.status, 'stable', name);
  }
  assert.match(run(dir, ['approve', '0011']).err, /0011/, 'an unknown number names it');
});
