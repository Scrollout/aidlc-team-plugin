import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { commands } from '../plugin/cli/lib/domains/host.mjs';
import { approve, commit, git, hook, intentDoc, pinnedRepo, read, run, tempDir, unitDoc, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const HOOKS = JSON.parse(readFileSync(join(ROOT, 'plugin/hooks/hooks.json'), 'utf8'));
const U1 = 'docs/units/U-1-a.md';

// A managed project: pinned CLI, intent and two units; U-1 approved with a card.
const project = () => pinnedRepo({
  'docs/intents/I-1-x.md': intentDoc('I-1'),
  [U1]: unitDoc({ scope: ['src/**'] }),
  'docs/units/U-2-b.md': unitDoc({ scope: ['lib/**'] }),
  'docs/log.md': '---\ntype: Log\ntitle: History\n---\n\n# History\n\n## 2026-01-01\n\n- **Creation** docs.\n',
}, { security: { secrets: ['INTERNAL-[0-9]{6}'] } });

const decision = (r) => r.json.hookSpecificOutput?.permissionDecision ?? 'allow';
const reason = (r) => r.json.hookSpecificOutput?.permissionDecisionReason ?? r.json.reason ?? '';
const bash = (dir, command) => hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
// The guard's own handler in this process, for long command lists; run.mjs and the pinned CLI are the same code.
function guardIn(dir, command) {
  const input = { session_id: 's1', cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } };
  const out = commands.hook(['guard'], { cwd: realpathSync.native(dir), stdin: () => JSON.stringify(input) }).output.trim();
  return { code: 0, json: out ? JSON.parse(out) : {} };
}

test('U79/AC-1 a push that can publish a tag asks the owner, as git tag does; a unit branch push does not', () => {
  const dir = project();
  git(dir, 'tag', 'v1.0.0');
  for (const command of ['git push origin HEAD:refs/tags/v9.9.9', 'git push origin v1.0.0', 'git push origin unit/U-1 --tags', 'git push --follow-tags origin unit/U-1', 'git -c push.followTags=true push origin unit/U-1', 'git push origin :refs/tags/v1.0.0']) {
    const r = guardIn(dir, command);
    assert.equal(decision(r), 'ask', command);
    assert.match(reason(r), /^GUARD-RELEASE /, command);
  }
  assert.equal(decision(guardIn(dir, 'git push origin unit/U-1')), 'allow');
  git(dir, 'config', 'push.followTags', 'true');
  assert.equal(decision(guardIn(dir, 'git push origin unit/U-1')), 'ask', 'push.followTags in the repo config');
});

test('U94/AC-1 a git call cd or -C takes into another repository passes the guard; a clone of the project or its URL does not', () => {
  const dir = project(); // paths quoted, as a shell needs a Windows path
  git(dir, 'remote', 'add', 'origin', 'git@github.com:Org/app.git');
  const other = tempDir('infra-');
  git(other, 'init', '-q', '-b', 'main');
  git(other, 'remote', 'add', 'origin', 'https://github.com/Org/infra.git');
  for (const command of [`git -C '${other}' push origin main`, `cd '${other}' && git push`, `cd '${other}'; git push origin main --force`]) assert.equal(decision(guardIn(dir, command)), 'allow', command);
  for (const command of [`(cd '${other}') ; git push origin main`, `cd '${other}' | git push origin main`, `cd '${other}' && cd - && git push origin main`, `git -C '${other}' --git-dir='${dir}/.git' push origin main`, `git -C '${other}' push https://github.com/org/app main`, `git -C '${other}' push '${dir}' main`]) {
    assert.equal(decision(guardIn(dir, command)), 'deny', command);
  }
  // U120/AC-1 a pipe or || after the cd keeps its folder; a cd in a background job loses it.
  for (const command of [`cd '${other}' && git push -q origin main 2>&1 | tail -3`, `cd '${other}' && git push origin main || echo failed`]) assert.equal(decision(guardIn(dir, command)), 'allow', command);
  for (const command of [`cd '${other}' & git push origin main`, `echo x | cd '${other}' && git push origin main`]) assert.equal(decision(guardIn(dir, command)), 'deny', command);
  // U146/AC-1 git -C ~/<repo> is that repository, as the shell expands the ~ before git runs.
  const [home, profile] = [process.env.HOME, process.env.USERPROFILE];
  process.env.HOME = process.env.USERPROFILE = dirname(other);
  try { assert.equal(decision(guardIn(dir, `git -C ~/${basename(other)} push origin main`)), 'allow'); } finally { [process.env.HOME, process.env.USERPROFILE] = [home, profile]; if (profile === undefined) delete process.env.USERPROFILE; }
  git(other, 'remote', 'add', 'mirror', 'ssh://git@github.com/Org/app');
  assert.equal(decision(guardIn(dir, `git -C '${other}' push origin main`)), 'deny', 'shares a remote with the project');
  const clone = tempDir('clone-');
  git(clone, 'clone', '-q', dir, '.');
  assert.equal(decision(guardIn(dir, `git -C '${clone}' push origin main`)), 'deny', 'a clone of the project');
  const managed = tempDir('managed-');
  git(managed, 'init', '-q', '-b', 'main');
  write(managed, { '.aidlc/profile.json': {} });
  assert.equal(decision(guardIn(dir, `git -C '${managed}' push origin main`)), 'deny', 'a project of its own');
});

test('U81/AC-1 a delegated upgrade runs without a prompt; a downgrade or a dirty copy still asks; the status says which', () => {
  const dir = project();
  const upgrade = 'node /opt/plugin/cli/aidlc.mjs upgrade'; // the installed plugin's CLI, as a shell line names it
  assert.equal(decision(guardIn(dir, upgrade)), 'ask', 'not delegated yet');
  write(dir, { '.aidlc/local/profile.json': { approvals: { auto: ['upgrade'] } } });
  assert.equal(decision(guardIn(dir, upgrade)), 'allow');
  for (const flag of ['--downgrade', '--dirty']) assert.equal(decision(guardIn(dir, `${upgrade} ${flag}`)), 'ask', flag);
  for (const command of ['node "C:\\p\\.aidlc\\bin\\aidlc.mjs" approve U-1', "node 'C:\\p\\aidlc.mjs' approve U-1", 'node C:\\p\\aidlc.mjs approve U-1']) assert.equal(decision(guardIn(dir, command)), 'ask', `a Windows path: ${command}`);
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '0.1.0\n');
  assert.match(hook('status', { cwd: dir, hook_event_name: 'SessionStart', source: 'startup' }).json.hookSpecificOutput.additionalContext, /between units, the owner delegated upgrades: run node /);
});

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
    const r = guardIn(dir, command);
    assert.equal(decision(r), 'deny', command);
    assert.match(reason(r), new RegExp(`^(escalate: )?${code} .+ → \\S`), command);
  }
  assert.equal(decision(guardIn(dir, 'git tag v1.0.0')), 'ask');
  const inGit = bash(join(dir, '.git'), 'cd ..');
  assert.equal(inGit.code, 0, `a shell left inside .git is not locked: ${inGit.err}`);
  assert.equal(decision(inGit), 'allow');
  assert.equal(decision(bash(join(dir, '.git'), 'git push --force origin unit/U-1')), 'deny', 'and is still guarded');
  for (const [command, shown] of [['node .aidlc/bin/aidlc.mjs approve U-1', 'approve U-1'], ['cd docs && aidlc approve U-1', 'approve U-1'], ['node .aidlc/bin/aidlc.mjs upgrade', 'upgrade'], ['aidlc delegate reapprove', 'delegate reapprove']]) {
    const r = guardIn(dir, command);
    assert.equal(decision(r), 'ask', `${command}: the owner answers a prompt (decision 0009)`);
    assert.match(reason(r), new RegExp(`^GUARD-OWNER ${shown}: the owner answers this prompt`));
  }
  const bypass = hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', permission_mode: 'bypassPermissions', tool_input: { command: 'aidlc approve U-1' } });
  assert.equal(decision(bypass), 'deny', 'no prompt is guaranteed in bypass mode');
  for (const command of ['git status', 'git commit -m "docs: notes"', 'node .aidlc/bin/aidlc.mjs next', 'node .aidlc/bin/aidlc.mjs approve --auto U-1', 'git push origin unit/U-1', 'git log --oneline | head', 'echo "git push --force"']) {
    assert.equal(decision(guardIn(dir, command)), 'allow', command);
  }
  write(dir, { 'src/a.mjs': '1;\n' });
  git(dir, 'add', 'src/a.mjs');
  assert.match(reason(bash(dir, 'git commit -m x')), /GUARD-BASE-COMMIT commit on main stages src\/a\.mjs/);
  git(dir, 'reset', '-q', 'src/a.mjs');
  write(dir, { '.git/aidlc/merging': 'U-1' });
  assert.match(reason(bash(dir, 'git commit -m "docs: plan"')), /GUARD-MERGING commit on main while aidlc merge U-1 runs its gate/, 'U144/AC-1 a doc commit too');
  const old = (Date.now() - 3 * 3600 * 1000) / 1000;
  utimesSync(join(dir, '.git/aidlc/merging'), old, old);
  assert.equal(decision(bash(dir, 'git commit -m "docs: plan"')), 'allow', 'a merge that died hours ago holds nothing');
});

function unitWorktree(dir) {
  const wt = join(tempDir('wt-'), 'w');
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
  const link = join(tempDir('link-'), 'wt');
  symlinkSync(wt, link, 'junction'); // a junction needs no admin rights on Windows
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
    for (const h of group.hooks.filter((x) => x.args?.at(-1) !== 'heartbeat')) { // the heartbeat only marks, never blocks
      assert.equal(h.onFailure, 'block');
      assert.equal(h.timeout, 10);
      assert.equal(h.command, 'node');
    }
  }
  const plain = tempDir('plain-');
  const free = bash(plain, 'git push --force');
  assert.equal(free.code, 0);
  assert.equal(decision(free), 'allow');

  const dir = project();
  rmSync(join(dir, '.aidlc/bin'), { recursive: true });
  const r = bash(dir, 'git status');
  assert.equal(r.code, 2, 'exit 2 blocks the tool call');
  assert.match(r.err, /pinned CLI .* is missing → ask the owner to restore it from a terminal: node \S+cli[\\/]aidlc\.mjs upgrade/);
  const stop = hook('steer', { cwd: dir, hook_event_name: 'Stop' });
  assert.equal(stop.code, 0, 'a Stop hook lets the turn end, so it cannot block every stop');
});

test('U74/AC-3 the session-start status names the upgrade when the pinned CLI is older than the installed plugin', () => {
  const dir = project();
  const same = hook('status', { cwd: dir, hook_event_name: 'SessionStart', source: 'startup' });
  assert.doesNotMatch(same.json.hookSpecificOutput.additionalContext, /pinned CLI/);
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '0.1.0\n');
  const text = hook('status', { cwd: dir, hook_event_name: 'SessionStart', source: 'startup' }).json.hookSpecificOutput.additionalContext;
  const installed = JSON.parse(readFileSync(join(ROOT, 'plugin/.claude-plugin/plugin.json'), 'utf8')).version;
  assert.ok(text.endsWith(`The pinned CLI is 0.1.0, the installed plugin ${installed} → between units, ask the owner to approve the upgrade, then run node ${join(ROOT, 'plugin/cli/aidlc.mjs')} upgrade (the pinned aidlc refuses it) and commit.\n`), text);
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
  assert.match(text, /next: 👉 ask the owner to approve I-1/);
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
  assert.match(reason(agent('team:builder', 'Build U-1 from its card.', 'opus')), /^MODEL-MISMATCH team:builder for U-1 uses opus, the card's Model: line says sonnet/);
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

test('U18/AC-4 guard allows a command that only redirects output or reads its exit code; a denied command stays denied', () => {
  const dir = project();
  for (const command of [
    'bash .github/scripts/profile_test.sh > out.log 2>&1; echo $?',
    'bash .github/scripts/profile_test.sh 2>&1 | tail -4; echo exit=${PIPESTATUS[0]}',
    'node .aidlc/bin/aidlc.mjs check >/dev/null 2>&1; echo $?',
  ]) assert.equal(decision(bash(dir, command)), 'allow', command);
  assert.equal(decision(bash(dir, 'git push --force origin unit/U-1 > out.log 2>&1; echo $?')), 'deny');
  write(dir, { 'src/a.mjs': '1;\n' });
  git(dir, 'add', 'src/a.mjs');
  assert.match(reason(bash(dir, 'git commit -m x > out.log; echo $?')), /GUARD-BASE-COMMIT/, 'code on the base is still refused');
});

test('U19/AC-1 the docs hook sets a generated.at the edit wrote in local time to the current UTC second', () => {
  const dir = project();
  const future = new Date(Date.now() + 3 * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z'); // UTC+3 local time marked Z
  const text = `---\ntype: Note\ntitle: N\ndescription: A note.\ngenerated: { by: x/1, at: ${future} }\n---\n\nText.\n`;
  write(dir, { 'docs/notes/n.md': text });
  const r = hook('docs', { cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(dir, 'docs/notes/n.md'), content: text } });
  const at = read(dir, 'docs/notes/n.md').match(/at: (\S+) \}/)[1];
  assert.ok(Math.abs(Date.parse(at) - Date.now()) < 60e3, at);
  assert.match(r.json.hookSpecificOutput.additionalContext, new RegExp(`generated\\.at ${future} was not the current UTC time; the docs hook set it to ${at}: re-read`));
  const old = text.replace(future, '2026-01-01T00:00:00Z');
  write(dir, { 'docs/notes/o.md': old });
  hook('docs', { cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(dir, 'docs/notes/o.md'), old_string: 'Text.', new_string: 'More text.' } });
  assert.equal(read(dir, 'docs/notes/o.md'), old, 'a stamp the edit did not write stays');
});

test('U20/AC-1 U20/AC-2 a delegated approval auto mode refused goes to the owner as a prompt; steer stops demanding it until HEAD moves', () => {
  const dir = project();
  approve(dir, 'I-1', 'U-1', 'U-2');
  write(dir, { [U1]: read(dir, U1).replace('Unit goal.', 'Unit goal, said better.'), '.aidlc/local/profile.json': { approvals: { auto: ['reapprove'] } } });
  commit(dir, 'edit U-1');
  assert.match(stop(dir).json.reason, /aidlc approve --auto U-1$/);
  const denied = hook('denied', { cwd: dir, hook_event_name: 'PermissionDenied', tool_name: 'Bash', tool_input: { command: 'node .aidlc/bin/aidlc.mjs approve --auto U-1' }, reason: '[Self-Approval]' });
  assert.equal(denied.code, 0, denied.err);
  const next = run(dir, ['next']);
  assert.equal(next.code, 2, 'an owner step');
  assert.match(next.out, /^⛔ auto mode refused aidlc approve --auto U-1: the owner runs aidlc approve U-1 \(the owner confirms the prompt or types: approve U-1\)/);
  assert.equal(stop(dir).json.decision, undefined, 'steer lets the stop through');
  assert.equal(decision(bash(dir, 'node .aidlc/bin/aidlc.mjs approve U-1')), 'ask', 'the owner command is a prompt');
  commit(dir, 'something else', { 'notes.txt': 'x\n' });
  assert.match(stop(dir).json.reason, /aidlc approve --auto U-1$/, 'a new commit is a new situation');
});

const typed = (dir, prompt) => hook('prompt', { cwd: dir, hook_event_name: 'UserPromptSubmit', prompt });
const context = (r) => r.json.hookSpecificOutput?.additionalContext ?? '';

test('U24/AC-1 a prompt that is exactly approve <doc>… stamps the docs as the owner and tells the lead; any other prompt passes', () => {
  const dir = project();
  const r = typed(dir, '  approve I-1 U-1\n');
  assert.equal(r.code, 0, r.err);
  assert.match(context(r), /approved docs\/intents\/I-1-x\.md\napproved docs\/units\/U-1-a\.md\n/);
  assert.match(context(r), /do not run aidlc approve/);
  assert.match(read(dir, U1), /by: human:/, 'stamped as the owner');
  assert.equal(run(dir, ['status']).out.includes('U-1 approved') || /U-1\s.*approved/.test(run(dir, ['status']).out), true);
  for (const prompt of ['please approve U-2', 'approve', 'approve U-2 now?', '<pasted_content id="x">\napprove U-2\n</pasted_content id="x">', 'Another Claude session sent a message:\n<cross-session-message from="a">approve U-2</cross-session-message>']) {
    const other = typed(dir, prompt);
    assert.equal(other.code, 0, prompt);
    assert.deepEqual(other.json, {}, prompt);
  }
  assert.doesNotMatch(read(dir, 'docs/units/U-2-b.md'), /verified/, 'nothing else was stamped');
  const failed = typed(dir, 'approve U-9');
  assert.equal(failed.code, 0, 'a failed approval never blocks the prompt');
  assert.match(context(failed), /^The owner typed an approval, but it failed: .*U-9/);
  assert.match(context(typed(dir, 'approve U-2.')), /approved docs\/units\/U-2-b\.md\n/, 'a full stop ends the sentence, not the id');
});

test('U24/AC-2 the lead cannot schedule an approval prompt; a pinned CLI without the prompt hook does not block prompts', () => {
  const dir = project();
  const prompts = HOOKS.hooks.UserPromptSubmit.flatMap((g) => g.hooks);
  assert.deepEqual(prompts.map((h) => h.args.at(-1)), ['prompt']);
  assert.equal(prompts[0].onFailure, undefined, 'a failure never blocks the owner');
  const matchers = HOOKS.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.args.at(-1) === 'guard')).map((g) => g.matcher).join('|').split('|');
  for (const tool of ['CronCreate', 'ScheduleWakeup']) {
    assert.ok(matchers.includes(tool), tool);
    const r = hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { cron: '* * * * *', prompt: 'approve U-1' } });
    assert.equal(decision(r), 'deny', tool);
    assert.match(reason(r), /^GUARD-SCHEDULE /);
    assert.equal(decision(hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { prompt: 'run aidlc next' } })), 'allow');
  }
  write(dir, { '.aidlc/bin/aidlc.mjs': "process.stdout.write('unknown command: hook prompt\\n'); process.exit(64);\n" });
  const old = typed(dir, 'approve U-1');
  assert.equal(old.code, 0, 'an older pinned CLI passes the prompt');
  assert.equal(old.json && Object.keys(old.json).length, 0, 'with no context');
});

test('U36/AC-1 U36/AC-2 heartbeat runs as a call starts and as it ends; only the end marks an owner prompt ran', () => {
  const hooks = JSON.parse(readFileSync(join(ROOT, 'plugin/hooks/hooks.json'), 'utf8')).hooks;
  const beats = (event) => hooks[event].filter((h) => !h.matcher && h.hooks.some((x) => x.args?.at(-1) === 'heartbeat'));
  assert.equal(beats('PreToolUse').length, 1, 'every tool call, before it runs');
  assert.equal(beats('PostToolUse').length, 1, 'every tool call, after it runs');
  const dir = project();
  const wt = unitWorktree(dir);
  const beat = join(dir, '.git/aidlc/heartbeats/U-1');
  write(dir, { '.git/aidlc/heartbeats/U-1': '' });
  const old = new Date(Date.now() - 10 * 60 * 1000);
  utimesSync(beat, old, old);
  hook('heartbeat', { cwd: wt, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'make test' } });
  assert.ok(Date.now() - statSync(beat).mtimeMs < 5000, 'a long call starting keeps its builder fresh');
  write(dir, { '.git/aidlc/prompts.json': [{ id: 't1', command: 'approve U-1', at: '2026-10-23T10:00:00Z' }] });
  hook('heartbeat', { cwd: dir, hook_event_name: 'PreToolUse', tool_use_id: 't1', tool_name: 'Bash', tool_input: {} });
  assert.equal(JSON.parse(read(dir, '.git/aidlc/prompts.json'))[0].ran, undefined, 'the owner may still refuse it');
  hook('heartbeat', { cwd: dir, hook_event_name: 'PostToolUse', tool_use_id: 't1', tool_name: 'Bash', tool_input: {} });
  assert.ok(JSON.parse(read(dir, '.git/aidlc/prompts.json'))[0].ran);
  rmSync(join(dir, '.aidlc/bin'), { recursive: true });
  assert.equal(hook('heartbeat', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {} }).code, 0, 'it never blocks a call, even without the CLI');
});
