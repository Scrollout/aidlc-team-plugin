import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approve, commit, git, intentDoc, makeRepo, read, run, unitDoc, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const RUN = join(ROOT, 'plugin/hooks/run.mjs');
const HOOKS = JSON.parse(readFileSync(join(ROOT, 'plugin/hooks/hooks.json'), 'utf8'));
const U1 = 'docs/units/U-1-a.md';

// A managed project: pinned CLI, intent and two units; U-1 approved with a card.
function project() {
  const dir = makeRepo({
    'docs/intents/I-1-x.md': intentDoc('I-1'),
    [U1]: unitDoc({ scope: ['src/**'] }),
    'docs/units/U-2-b.md': unitDoc({ scope: ['lib/**'] }),
    'docs/log.md': '---\ntype: Log\ntitle: History\n---\n\n# History\n\n## 2026-01-01\n\n- **Creation** docs.\n',
  }, { security: { secrets: ['INTERNAL-[0-9]{6}'] } });
  const init = run(dir, ['upgrade']);
  assert.equal(init.code, 0, init.err);
  commit(dir, 'pin the CLI');
  return dir;
}

function hook(name, input) {
  const r = spawnSync(process.execPath, [RUN, name], { input: JSON.stringify({ session_id: 's1', ...input }), encoding: 'utf8' });
  const out = r.stdout.trim();
  return { code: r.status, json: out ? JSON.parse(out) : {}, err: r.stderr };
}
const decision = (r) => r.json.hookSpecificOutput?.permissionDecision ?? 'allow';
const reason = (r) => r.json.hookSpecificOutput?.permissionDecisionReason ?? r.json.reason ?? '';
const bash = (dir, command) => hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

test('U7/AC-1 guard denies each listed command and allows the everyday ones', () => {
  const dir = project();
  const denied = {
    'git push --force origin unit/U-1': 'GUARD-FORCE',
    'git push origin +unit/U-1': 'GUARD-FORCE',
    'git push origin main': 'GUARD-PUSH',
    'git push': 'GUARD-PUSH',
    'git push origin --delete main': 'GUARD-BASE-DELETE',
    'git branch -D main': 'GUARD-BASE-DELETE',
    'git commit --no-verify -m x': 'GUARD-NOVERIFY',
    'git commit -nm x': 'GUARD-NOVERIFY',
    'git merge --no-ff unit/U-1': 'GUARD-MERGE',
    'FOO=1 git -C . push -f': 'GUARD-FORCE',
  };
  for (const [command, code] of Object.entries(denied)) {
    const r = bash(dir, command);
    assert.equal(decision(r), 'deny', command);
    assert.match(reason(r), new RegExp(`^(escalate: )?${code} .+ → \\S`), command);
  }
  assert.equal(decision(bash(dir, 'git tag v1.0.0')), 'ask');
  const inGit = bash(join(dir, '.git'), 'cd ..');
  assert.equal(inGit.code, 0, `a shell left inside .git is not locked: ${inGit.err}`);
  assert.equal(decision(inGit), 'allow');
  assert.equal(decision(bash(join(dir, '.git'), 'git push --force origin unit/U-1')), 'deny', 'and is still guarded');
  for (const [command, shown] of [['node .aidlc/bin/aidlc.mjs approve U-1', 'approve U-1'], ['cd docs && aidlc approve U-1', 'approve U-1'], ['node .aidlc/bin/aidlc.mjs upgrade', 'upgrade'], ['aidlc delegate reapprove', 'delegate reapprove']]) {
    const r = bash(dir, command);
    assert.equal(decision(r), 'ask', `${command}: the owner answers a prompt (decision 0009)`);
    assert.match(reason(r), new RegExp(`^GUARD-OWNER ${shown}: the owner answers this prompt`));
  }
  const bypass = hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', permission_mode: 'bypassPermissions', tool_input: { command: 'aidlc approve U-1' } });
  assert.equal(decision(bypass), 'deny', 'no prompt is guaranteed in bypass mode');
  for (const command of ['git status', 'git commit -m "docs: notes"', 'node .aidlc/bin/aidlc.mjs next', 'node .aidlc/bin/aidlc.mjs approve --auto U-1', 'git push origin unit/U-1', 'git log --oneline | head', 'echo "git push --force"']) {
    assert.equal(decision(bash(dir, command)), 'allow', command);
  }
  write(dir, { 'src/a.mjs': '1;\n' });
  git(dir, 'add', 'src/a.mjs');
  assert.match(reason(bash(dir, 'git commit -m x')), /GUARD-BASE-COMMIT commit on main stages src\/a\.mjs/);
});

function unitWorktree(dir) {
  const wt = join(mkdtempSync(join(tmpdir(), 'wt-')), 'w');
  git(dir, 'worktree', 'add', '-q', '-b', 'unit/U-1', wt, 'main');
  return wt;
}
const writeTool = (cwd, file, content) => ({ cwd, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: join(cwd, file), content } });

test('U7/AC-2 scope: in-scope writes pass, out-of-scope and merge-written files are denied, approvals are the owner\'s', () => {
  const dir = project();
  const wt = unitWorktree(dir);
  assert.equal(decision(hook('scope', writeTool(wt, 'src/a.mjs', '1;\n'))), 'allow');
  assert.match(reason(hook('scope', writeTool(wt, 'lib/x.mjs', '1;\n'))), /^SCOPE-OUT lib\/x\.mjs is outside the scope of U-1/);
  write(dir, { '.git/aidlc/cards/U-1.json': { unit: 'U-1', scope: ['src/**', 'lib/**'] } });
  assert.equal(decision(hook('scope', writeTool(wt, 'lib/x.mjs', '1;\n'))), 'allow', 'the card\'s scope wins over an older doc on the branch');
  rmSync(join(dir, '.git/aidlc/cards/U-1.json'));
  assert.match(reason(hook('scope', writeTool(wt, 'docs/log.md', 'x\n'))), /^SCOPE-SHARED docs\/log\.md is written by merge/);
  const link = join(mkdtempSync(join(tmpdir(), 'link-')), 'wt');
  symlinkSync(wt, link);
  assert.match(reason(hook('scope', writeTool(link, 'lib/x.mjs', '1;\n'))), /^SCOPE-OUT lib\/x\.mjs/, 'a symlink in the session\'s path does not escape the scope');
  assert.equal(decision(hook('scope', writeTool(dir, 'lib/x.mjs', '1;\n'))), 'allow', 'outside a unit worktree there is no scope');
  assert.match(reason(hook('scope', writeTool(dir, '.aidlc/local/profile.json', '{}'))), /^SCOPE-APPROVAL/, 'only the owner delegates approvals');

  approve(dir, 'U-1');
  const doc = read(dir, U1);
  const edit = (old_string, new_string) => hook('scope', { cwd: dir, tool_name: 'Edit', tool_input: { file_path: join(dir, U1), old_string, new_string } });
  assert.equal(decision(edit('it works.', 'it works well.')), 'allow');
  assert.match(reason(edit('human:owner@example.com', 'human:agent@example.com')), /^SCOPE-APPROVAL/);
  const hash = doc.match(/verified_hash: (\w+)/)[1];
  assert.match(reason(edit(hash, 'f'.repeat(64))), /^SCOPE-APPROVAL/);
  const fresh = unitDoc({ scope: ['z/**'] }).replace('---\n\n', 'verified: [{ by: human:me@x, at: 2026-01-01T00:00:00Z }]\n---\n\n');
  assert.match(reason(hook('scope', writeTool(dir, 'docs/units/U-3-c.md', fresh))), /^SCOPE-APPROVAL/);
});

test('U7/AC-3 blocking hooks fail closed; unmanaged folders are left alone; a missing CLI denies tool calls only', () => {
  for (const group of HOOKS.hooks.PreToolUse) {
    for (const h of group.hooks) {
      assert.equal(h.onFailure, 'block');
      assert.equal(h.timeout, 10);
      assert.equal(h.command, 'node');
    }
  }
  const plain = mkdtempSync(join(tmpdir(), 'plain-'));
  const free = bash(plain, 'git push --force');
  assert.equal(free.code, 0);
  assert.equal(decision(free), 'allow');

  const dir = project();
  rmSync(join(dir, '.aidlc/bin'), { recursive: true });
  const r = bash(dir, 'git status');
  assert.equal(r.code, 2, 'exit 2 blocks the tool call');
  assert.match(r.err, /pinned CLI .* is missing → ask the owner to restore it: ! node \S+cli\/aidlc\.mjs upgrade/);
  const stop = hook('steer', { cwd: dir, hook_event_name: 'Stop' });
  assert.equal(stop.code, 0, 'a Stop hook lets the turn end, so it cannot block every stop');
});

test('U7/AC-4 the status injection stays within 1,000 chars', () => {
  const dir = project();
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, k) => [`docs/units/U-${k + 3}-long.md`, unitDoc({ scope: [`m${k}/**`], title: `A rather long unit title number ${k}` })]));
  commit(dir, 'many units', many);
  const r = hook('status', { cwd: dir, hook_event_name: 'SessionStart', source: 'clear' });
  const text = r.json.hookSpecificOutput.additionalContext;
  assert.ok(text.length <= 1000, String(text.length));
  assert.match(text, /^I-1 draft/m);
  assert.match(text, /… \d+ more/);
  assert.match(text, /next: ask the owner to approve I-1/);
  assert.match(text, /Load the aidlc skill and run aidlc next\.\n$/);
});

test('U7/AC-5 secrets denies a write containing a key and allows the same file without it', () => {
  const dir = project();
  const key = 'AKIA' + 'Q'.repeat(16);
  assert.match(reason(hook('secrets', writeTool(dir, 'src/config.mjs', `export const key = '${key}';\n`))), /^SECRET src\/config\.mjs contains what looks like a secret/);
  assert.equal(decision(hook('secrets', writeTool(dir, 'src/config.mjs', 'export const key = process.env.KEY;\n'))), 'allow');
  assert.equal(decision(hook('secrets', writeTool(dir, 'src/x.mjs', 'id = INTERNAL-123456\n'))), 'deny', 'profile patterns apply');
});

const stop = (dir, extra = {}) => hook('steer', { cwd: dir, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Done.', ...extra });

test('U7/AC-6 steer blocks a stop when next is autonomous, allows it at a human gate, never twice in a row', () => {
  const dir = project();
  assert.equal(stop(dir).json.decision, undefined, 'intent not approved: a human gate');
  approve(dir, 'I-1', 'U-1', 'U-2');
  const r = stop(dir);
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /^build U-1, U-2/);
  assert.equal(stop(dir, { stop_hook_active: true }).json.decision, undefined, 'never blocks twice in a row');
  assert.equal(stop(dir, { last_assistant_message: 'Shall I build both units now?' }).json.decision, undefined, 'the owner was asked');
  assert.equal(stop(dir, { last_assistant_message: '**U-6: hold until U-9 merges, or merge now?**\n- A hold (recommended)\n- B merge now' }).json.decision, undefined, 'a question followed by its options');
  assert.equal(stop(dir, { last_assistant_message: 'See https://example.com/?q=1 for details.' }).json.decision, 'block', 'a ? inside a line is no question');
});

test('U7/AC-7 the same denial three times in a turn escalates; the turn end resets it', () => {
  const dir = project();
  const reasons = [1, 2, 3].map(() => reason(bash(dir, 'git push --force')));
  assert.doesNotMatch(reasons[1], /^escalate/);
  assert.match(reasons[2], /^escalate: GUARD-FORCE .+ \(denied 3 times this turn; stop and tell the owner\)$/);
  stop(dir);
  assert.doesNotMatch(reason(bash(dir, 'git push --force')), /^escalate/);
});

test('U7/AC-8 a builder or reviewer with another model than the card\'s is denied', () => {
  const dir = project();
  approve(dir, 'I-1', 'U-1');
  assert.equal(run(dir, ['card', 'U-1']).code, 0);
  const agent = (subagent_type, prompt, model) => hook('model', { cwd: dir, tool_name: 'Agent', tool_input: { subagent_type, prompt, description: 'x', model } });
  assert.equal(decision(agent('team:builder', 'Build U-1 from its card.', 'sonnet')), 'allow');
  assert.ok(Date.now() - statSync(join(dir, '.git/aidlc/heartbeats/U-1')).mtimeMs < 5000, 'a builder is in flight from its launch');
  assert.match(reason(agent('team:builder', 'Build U-1 from its card.', 'opus')), /^MODEL-MISMATCH team:builder for U-1 uses opus, the card says sonnet/);
  assert.match(reason(agent('team:builder', 'Build U-1.', undefined)), /uses none/);
  assert.match(reason(agent('team:builder', 'Build the pricing unit.', 'sonnet')), /^MODEL-UNIT/);
  assert.equal(decision(agent('team:reviewer', 'Review U-1.', 'opus')), 'allow');
  assert.equal(decision(agent('team:reviewer', 'Review U-1.', 'haiku')), 'deny');
  assert.equal(decision(agent('Explore', 'Find things', 'haiku')), 'allow');
});

test('docs returns OKF errors for the edited file; heartbeat touches the unit file', () => {
  const dir = project();
  write(dir, { 'docs/notes/bad.md': '# no frontmatter\n' });
  const r = hook('docs', { cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(dir, 'docs/notes/bad.md') } });
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /docs\/notes\/bad\.md:1 OKF-FM/);
  assert.ok(existsSync(join(dir, 'docs/notes/index.md')), 'the lead\'s indexes are regenerated');

  const wt = unitWorktree(dir);
  hook('heartbeat', { cwd: wt, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {} });
  const beat = join(dir, '.git/aidlc/heartbeats/U-1');
  assert.ok(Date.now() - statSync(beat).mtimeMs < 5000);
  const old = new Date(Date.now() - 10 * 60 * 1000);
  utimesSync(beat, old, old);
  hook('heartbeat', { cwd: wt, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: {}, agent_type: 'team:reviewer' });
  assert.ok(Date.now() - statSync(beat).mtimeMs > 5 * 60 * 1000, 'a reviewer in the worktree keeps no builder alive');
});
