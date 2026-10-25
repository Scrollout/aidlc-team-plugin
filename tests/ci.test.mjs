import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, branch, CLI, commit, git, intentDoc, makeRepo, merge, read, report, review, tempDir, unitDoc, write } from './state-repo.mjs';

const STUB = join(import.meta.dirname, 'fixtures/ci/gh.mjs');
const run = (id, conclusion = null, status = conclusion ? 'completed' : 'in_progress') => ({ id, name: `ci-${id}`, status, conclusion, html_url: `https://example.com/runs/${id}` });

// I-1 with U-1 approved, a bare remote holding main, and the CI stub serving `polls` in turn.
function setup({ polls = [[run(1, 'success')]], ci = { wait: 5, interval: 0 }, push = true } = {}) {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/units/U-1-u.md': unitDoc({ scope: ['a/**'] }) },
    { github: { repo: 'acme/shop', gh: [process.execPath, STUB] }, ...(ci && { ci }) });
  approve(dir, 'I-1', 'U-1');
  const remote = tempDir('remote-');
  git(remote, 'init', '-q', '--bare');
  git(dir, 'remote', 'add', 'origin', remote);
  if (push) git(dir, 'push', '-q', 'origin', 'main');
  const stub = join(tempDir('gh-'), 'state.json');
  writeFileSync(stub, JSON.stringify({ polls }));
  return { dir, stub };
}

function aidlc({ dir, stub }, ...args) {
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...env, GH_STUB: stub } });
  return { code: r.status, out: r.stdout.replace('the board is behind: aidlc sync\n', ''), err: r.stderr }; // the board has its own tests
}
const record = ({ dir }) => JSON.parse(read(dir, '.git/aidlc/ci.json'));
const calls = ({ stub }) => JSON.parse(readFileSync(stub, 'utf8')).paths ?? [];
const setRecord = ({ dir }, state, runs = [run(4, state === 'red' ? 'failure' : 'success')]) =>
  write(dir, { '.git/aidlc/ci.json': JSON.stringify({ sha: git(dir, 'rev-parse', 'main'), state, runs, at: new Date().toISOString() }) });

test('U71/AC-1 ci wait polls the pushed base head until its runs complete and records them', () => {
  const ctx = setup({ polls: [[run(1)], [run(1, 'success'), run(2, 'skipped')]] });
  const sha = git(ctx.dir, 'rev-parse', 'main');
  const r = aidlc(ctx, 'ci', 'wait');
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`^CI on main ${sha.slice(0, 12)}: green\n  ci-1: completed success https://example.com/runs/1\n`));
  assert.equal(record(ctx).sha, sha);
  assert.equal(record(ctx).state, 'green');
  assert.deepEqual(calls(ctx), [`repos/acme/shop/actions/runs?head_sha=${sha}&per_page=100`, `repos/acme/shop/actions/runs?head_sha=${sha}&per_page=100`]);
});

test('U71/AC-1 a red run ends the wait at once, exits 1 and names its log command', () => {
  const ctx = setup({ polls: [[run(7, 'failure'), run(8)]] });
  const r = aidlc(ctx, 'ci', 'wait');
  assert.equal(r.code, 1);
  assert.match(r.out, /: red\n/);
  assert.match(r.out, /  logs: gh run view 7 --log-failed\n/);
  assert.doesNotMatch(r.out, /view 8/);
  assert.equal(calls(ctx).length, 1, 'no poll after the red run');
  assert.equal(record(ctx).state, 'red');
});

test('U71/AC-1 runs still going when the wait ends are pending; no run at all is none', () => {
  const pending = setup({ polls: [[run(1)]], ci: { wait: 2, interval: 0.05 } }); // a wait well above one gh spawn, slow on Windows
  assert.equal(aidlc(pending, 'ci', 'wait').code, 0);
  assert.equal(record(pending).state, 'pending');
  assert.ok(calls(pending).length > 1, 'it polled again within the wait');
  const none = setup({ polls: [[]], ci: { wait: 0.1, interval: 0.05 } });
  assert.match(aidlc(none, 'ci', 'wait').out, /: none\n/);
});

test('U71/AC-1 ci wait is refused on a base not pushed, and without ci.wait or github.repo', () => {
  const ctx = setup({ push: false });
  const r = aidlc(ctx, 'ci', 'wait');
  assert.equal(r.code, 64);
  assert.match(r.err, /push main first: aidlc push/);
  assert.equal(calls(ctx).length, 0);
  assert.equal(aidlc(setup({ ci: null }), 'ci', 'wait').code, 64);
  assert.equal(aidlc(ctx, 'ci').code, 64);
  const noRepo = makeRepo({}, { ci: { wait: 5 } });
  assert.match(aidlc({ dir: noRepo, stub: ctx.stub }, 'ci', 'wait').err, /ci\.wait \(seconds\) and github\.repo/);
});

test('U71/AC-2 U115/AC-2 with ci.wait a builder starts only on a pushed base, its CI waited for beside it', () => {
  const ctx = setup({ push: false });
  assert.equal(aidlc(ctx, 'next').out, 'the base has merges its remote lacks: push it before new builders: aidlc push\n');
  git(ctx.dir, 'push', '-q', 'origin', 'main');
  assert.match(aidlc(ctx, 'next').out, /^build U-1 \(cards: [^)]+\); meanwhile run aidlc ci wait in the background$/m);
  setRecord(ctx, 'pending');
  assert.match(aidlc(ctx, 'next').out, /^build U-1 .*aidlc ci wait in the background/, 'a pending poll asks again');
  setRecord(ctx, 'green');
  assert.match(aidlc(ctx, 'next').out, /^build U-1 \(cards: [^)]+\)$/m);
  commit(ctx.dir, 'docs on the base', { 'notes.md': 'x\n' });
  assert.match(aidlc(ctx, 'next').out, /aidlc push/, 'a newer base asks for its own CI');

  const off = setup({ ci: null, push: false });
  assert.match(aidlc(off, 'next').out, /^build U-1/, 'without ci.wait next is unchanged');
});

test('U71/AC-2 merges and reviews still come before the push', () => {
  const ctx = setup({ push: false });
  write(ctx.dir, { 'docs/units/U-2-v.md': unitDoc({ scope: ['b/**'] }) });
  commit(ctx.dir, 'U-2');
  approve(ctx.dir, 'U-2');
  branch(ctx.dir, 'U-1', 'a/x.txt');
  report(ctx.dir, 'U-1');
  assert.match(aidlc(ctx, 'next').out, /^review U-1/);
});

test('U71/AC-3 a red base comes first: a fix unit, then only fix units build or merge', () => {
  const ctx = setup();
  write(ctx.dir, { 'docs/units/U-2-v.md': unitDoc({ scope: ['b/**'] }) });
  commit(ctx.dir, 'U-2');
  approve(ctx.dir, 'U-2');
  git(ctx.dir, 'push', '-q', 'origin', 'main');
  branch(ctx.dir, 'U-2', 'b/x.txt');
  report(ctx.dir, 'U-2');
  setRecord(ctx, 'red');
  const next = aidlc(ctx, 'next');
  assert.equal(next.out, 'CI is red on the base (ci-4): only a fix unit builds; read the logs (gh run view 4 --log-failed). A failure outside this repo (runner, registry, network): fix or wait for it, rerun with gh run rerun <id> --failed, then aidlc ci wait. Else draft a fix: aidlc fix "<what failed>" --scope <code globs> --scope "<test globs>"\n');
  assert.equal(next.code, 0, 'the lead drafts it');

  const fix = aidlc(ctx, 'fix', 'export breaks', '--scope', 'c/**', '--scope', 'c/**/*.test.mjs');
  assert.equal(fix.code, 0, fix.err);
  commit(ctx.dir, 'the fix unit');
  assert.match(aidlc(ctx, 'next').out, /^review U-2/, 'a plan commit keeps the base red; other reviews go on');
  review(ctx.dir, 'U-2', 'pass');
  assert.doesNotMatch(aidlc(ctx, 'next').out, /merge U-2/, 'a reviewed unit of an intent waits while red');
  setRecord(ctx, 'green');
  assert.match(aidlc(ctx, 'next').out, /merge U-2/);
  const units = (out) => /^build (.+?):/.exec(out)?.[1];
  const ready = setup();
  write(ready.dir, { 'docs/units/U-2-v.md': unitDoc({ scope: ['b/**'] }) });
  commit(ready.dir, 'U-2');
  approve(ready.dir, 'U-2');
  setRecord(ready, 'red');
  assert.equal(aidlc(ready, 'fix', 'export breaks', '--scope', 'c/**', '--scope', 'c/**/*.test.mjs').code, 0);
  commit(ready.dir, 'the fix unit');
  approve(ready.dir, 'U-3');
  const out = aidlc(ready, 'next').out;
  assert.match(out, /^build U-3/, out);
  assert.doesNotMatch(units(out) ?? '', /U-1|U-2/, 'units of an intent wait while red');

  branch(ready.dir, 'U-3', 'c/x.txt');
  merge(ready.dir, 'U-3');
  assert.match(aidlc(ready, 'next').out, /aidlc push/, 'the merged fix ends the red base: push and wait again');
});
