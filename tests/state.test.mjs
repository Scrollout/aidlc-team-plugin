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
  assert.match(r.out, /^next: re-approve U-3/m);
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
  'stale approval': [/^re-approve U-1 after their edits: ! aidlc approve U-1/, 2, (dir) => {
    approve(dir, 'I-1', 'U-1');
    commit(dir, 'edit', { [U(1)]: read(dir, U(1)) + '\nMore text.\n' });
  }],
  'elaborating (intent not approved)': [/^ask the owner to approve I-1: ! aidlc approve I-1/, 2, () => {}],
  'plan pending': [/^ask the owner to approve the plan: ! aidlc approve U-1 U-2$/, 2, (dir) => approve(dir, 'I-1')],
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
  reported: [/^review U-1: reviewer \(card: aidlc card U-1\)/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    report(dir, 'U-1');
  }],
  'building, stale heartbeat': [/^restart the builder of U-1 from branch unit\/U-1/, 0, (dir) => {
    approve(dir, 'I-1', 'U-1', 'U-2');
    branch(dir, 'U-1');
    heartbeat(dir, 'U-1', 5 * 60 * 1000);
  }],
  'building, fresh heartbeat': [/^wait for the builders of U-1$/, 0, (dir) => {
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
  assert.match(doc.fm.verified[0].at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
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
