// A unit's life as the pilot ran it, through the real hooks: a builder in flight from launch, a clear, a lost
// builder restarted on a clean worktree, a fix round in flight, and a fix round reported with no new commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { aidlc, approve, commit, git, hook, intentDoc, pinnedRepo, review, run, tempDir, unitDoc } from './state-repo.mjs';

const launch = (dir, agent, prompt, model) => hook('model', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: `team:${agent}`, prompt, model } }).json;
const next = (dir) => run(dir, ['next']).out;
const quiet = (dir) => utimesSync(join(aidlc(dir), 'heartbeats', 'U-1'), new Date(0), new Date(0));
function worktree(dir, n) {
  const wt = join(tempDir('wt-'), 'w');
  git(dir, 'worktree', 'add', '-q', '-b', `worktree-agent-${n}`, wt, 'main');
  return wt;
}

test('U4/AC-6 a unit survives a clear, a lost builder and fix rounds with no duplicate builder and no lost commit', () => {
  const dir = pinnedRepo({ 'docs/intents/I-1-p.md': intentDoc('I-1'), 'docs/units/U-1-p.md': unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  assert.match(next(dir), /^build U-1 /);
  run(dir, ['card', 'U-1']);

  launch(dir, 'builder', 'Build U-1 from its card.', 'sonnet');
  assert.match(next(dir), /^wait for the builders and reviewers of U-1$/m, 'in flight from launch, before its first tool call');
  assert.match(next(dir), /^wait/, 'a clear: a fresh next reads the same state from disk');

  const wt1 = worktree(dir, 1);
  assert.equal(run(wt1, ['start', 'U-1']).code, 0);
  commit(wt1, 'U-1 AC-1: first slice', { 'src/a.txt': 'a\n' });
  quiet(dir);
  assert.match(next(dir), /^restart the builder of U-1/, 'a builder that went quiet is restarted, once');

  run(dir, ['card', 'U-1']);
  launch(dir, 'builder', 'Continue U-1 from its branch.', 'sonnet');
  assert.match(next(dir), /^wait/);
  const wt2 = worktree(dir, 2);
  const start = run(wt2, ['start', 'U-1']);
  assert.equal(start.code, 0, `the clean worktree is taken over despite the launch mark: ${start.out}`);
  assert.equal(run(dir, ['report', 'U-1'], '{"status": "done"}').code, 0);
  quiet(dir);
  assert.match(next(dir), /^review U-1, focus general/);

  review(dir, 'U-1', 'fix', [{ path: 'src/a.txt', line: 1, claim: 'x', scenario: 'y', confidence: 'CONFIRMED' }]);
  assert.match(next(dir), /^fix round for U-1/);
  launch(dir, 'builder', 'Fix round for U-1.', 'sonnet');
  assert.match(next(dir), /^wait/, 'a fix round in flight is not offered again');
  run(dir, ['report', 'U-1'], '{"status": "done", "summary": "the findings need no change"}');
  quiet(dir);
  assert.match(next(dir), /^review U-1, focus general/, 'a fix round with no new commit gets a new review, not another fix round');

  assert.equal(git(dir, 'log', '--format=%s', '-1', 'unit/U-1'), 'U-1 AC-1: first slice', 'no commit lost');
});
