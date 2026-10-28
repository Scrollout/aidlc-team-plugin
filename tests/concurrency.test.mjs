// M30 B259: two merges at once, and a builder's commit on the base while one runs, end with one merge on the base and the
// other refused, never a half merge (docs/design/gate.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { tryGit } from '../plugin/cli/lib/index.mjs';
import { CHILD_ENV, CLI, git } from './state-repo.mjs';
import { PROFILE, setup } from './gate-repo.mjs';

// A module check that runs long enough for a second merge to start while the first holds the lock.
const SLOW = 'node -e "setTimeout(() => {}, 1500)"';
// A module check that commits on the base, as a builder working there would, while the gate runs.
const BUILDER = "node -e \"require('child_process').execFileSync('git', ['-C', process.env.BASE_REPO, 'commit', '--allow-empty', '-q', '-m', 'a builder commit'])\"";
const withCheck = (check) => setup({ profile: { ...PROFILE, modules: [{ ...PROFILE.modules[0], check }] } });

const merge = (dir, env = {}) => new Promise((done) => {
  const p = spawn(process.execPath, [CLI, 'merge', 'U-1'], { cwd: dir, env: { ...CHILD_ENV, ...env } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => done({ code, out }));
});
// No merge left half done: no merge in progress, no staged or changed tracked file on the base.
const whole = (dir) => {
  assert.equal(tryGit(dir, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), null);
  assert.equal(git(dir, 'status', '--porcelain', '--untracked-files=no'), '');
};
const merges = (dir) => git(dir, 'log', '--merges', '--format=%s', 'main').split('\n').filter(Boolean);

test('B259/AC-2 B259/AC-3 two merges started at once: one merges, the other is refused while the first holds the lock', async () => {
  const dir = withCheck(SLOW);
  const results = await Promise.all([merge(dir), merge(dir)]);
  const [won, lost] = [results.filter((r) => r.code === 0), results.filter((r) => r.code !== 0)];
  assert.equal(won.length, 1, results.map((r) => r.out).join('\n---\n'));
  assert.match(lost[0].out, /U-1 was not merged: the merge of U-1 is running/);
  assert.equal(merges(dir).length, 1);
  whole(dir);
});

test('B259/AC-2 B259/AC-3 a commit on the base while the gate runs refuses the merge, never half merging', async () => {
  const dir = withCheck(BUILDER);
  const before = merges(dir).length, r = await merge(dir, { BASE_REPO: dir });
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /U-1 was not merged: main moved while its gate ran/);
  assert.equal(merges(dir).length, before, 'no merge commit');
  assert.equal(git(dir, 'log', '-1', '--format=%s', 'main'), 'a builder commit');
  whole(dir);
});
