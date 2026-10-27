// U70/AC-2: the security review's fixes; each case names its finding (docs/design/hook-checks.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { commands } from '../plugin/cli/lib/domains/host.mjs';
import { commit, git, intentDoc, pinnedRepo, run, tempDir, unitDoc, write } from './state-repo.mjs';
import { codes, merge, setup } from './gate-repo.mjs';

const project = () => pinnedRepo({
  'docs/intents/I-1-x.md': intentDoc('I-1'),
  'docs/units/U-1-a.md': unitDoc({ scope: ['src/**'] }),
  'src/a.mjs': '1;\n',
});
// One hook's handler in this process; run.mjs and the pinned CLI are the same code.
function call(name, input) {
  const out = commands.hook([name], { cwd: realpathSync.native(input.cwd), stdin: () => JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', ...input }) }).output.trim();
  const h = out ? JSON.parse(out).hookSpecificOutput : null;
  return { decision: h?.permissionDecision ?? 'allow', reason: h?.permissionDecisionReason ?? '' };
}
const bash = (cwd, command) => call('guard', { cwd, tool_name: 'Bash', tool_input: { command } });
function expect(cwd, cases) {
  for (const [command, want] of Object.entries(cases)) {
    const r = bash(cwd, command);
    const [decision, code] = want.split(' ');
    assert.equal(r.decision, decision, command);
    if (code) assert.match(r.reason, new RegExp(`^(escalate: )?${code} `), command);
  }
}
function unitWorktree(dir) {
  const wt = join(tempDir('wt-'), 'w');
  git(dir, 'worktree', 'add', '-q', '-b', 'unit/U-1', wt, 'main');
  return wt;
}
const AWS = 'AKIA' + 'Q'.repeat(16); // built here, so this file holds no secret

test('U70/AC-2 #1 #10 --auto exempts only approve; owner steps refuse unknown flags; comments and redirect targets are no argv', () => {
  const dir = project();
  expect(dir, {
    'node .aidlc/bin/aidlc.mjs release I-1 --auto': 'ask GUARD-OWNER',
    'aidlc rollback I-1 --auto': 'ask GUARD-OWNER',
    'aidlc upgrade --auto': 'ask GUARD-OWNER',
    'aidlc delegate quick --auto': 'ask GUARD-OWNER',
    'aidlc mode unattended --auto': 'ask GUARD-OWNER',
    'aidlc approve U-1 # --auto': 'ask GUARD-OWNER',
    'aidlc approve U-1 > --auto': 'ask GUARD-OWNER',
    'aidlc approve U-1 2>--auto': 'ask GUARD-OWNER',
    'aidlc approve --auto U-1': 'allow',
    'aidlc approve --auto U-1 > out.txt # done': 'allow',
  });
  assert.match(run(dir, ['release', 'I-1', '--auto']).err, /usage: aidlc release <intent>/);
  assert.match(run(dir, ['rollback', 'I-1', '--auto']).err, /usage: aidlc rollback <intent>/);
  for (const args of [['mode', 'off', '--auto'], ['delegate', 'quick', '--auto'], ['upgrade', '--auto']]) assert.equal(run(dir, args).code, 64, args.join(' '));
});

test('U70/AC-2 #2 #5 on the base a commit\'s pathspecs and --include/--only files count as staged; long options match by prefix', () => {
  const dir = project();
  write(dir, { 'src/a.mjs': '2;\n', 'docs/notes.md': 'x\n' });
  expect(dir, {
    'git commit -m x src/a.mjs': 'deny GUARD-BASE-COMMIT',
    'git commit -m x -- src/a.mjs': 'deny GUARD-BASE-COMMIT',
    'git commit --include src/a.mjs -m x': 'deny GUARD-BASE-COMMIT',
    'git commit --only -m x src/a.mjs': 'deny GUARD-BASE-COMMIT',
    'git commit -am x': 'deny GUARD-BASE-COMMIT',
    'git commit --al -m x': 'deny GUARD-BASE-COMMIT',
    'git commit --no-verif -m x': 'deny GUARD-NOVERIFY',
    'git commit -m src/a.mjs': 'allow',
    'git commit -m x docs/notes.md': 'allow',
  });
});

test('U70/AC-2 #3 #15 pushes and ref moves that reach the base are denied, and so are command-line git aliases', () => {
  const dir = project();
  const wt = unitWorktree(dir);
  expect(wt, {
    'git push --all origin': 'deny GUARD-PUSH',
    'git push --mirror origin': 'deny GUARD-PUSH',
    'git push origin "refs/heads/*:refs/heads/*"': 'deny GUARD-PUSH',
    'git -c remote.origin.push=HEAD:main push': 'deny GUARD-PUSH',
    'git -c push.default=matching push origin': 'deny GUARD-PUSH',
    'git update-ref refs/heads/main HEAD': 'deny GUARD-BASE-MOVE',
    'git branch -f main HEAD': 'deny GUARD-BASE-MOVE',
    'git checkout -B main': 'deny GUARD-BASE-MOVE',
    'git -c alias.p=push p origin main': 'deny GUARD-ALIAS',
    'git -calias.x=push x': 'deny GUARD-ALIAS',
    'git config alias.p push': 'deny GUARD-ALIAS',
    'git push': 'allow',
    'git push -u origin unit/U-1': 'allow',
    'git branch -f unit/U-9 main': 'allow',
  });
  git(dir, 'config', 'remote.origin.push', 'HEAD:main');
  expect(wt, { 'git push': 'deny GUARD-PUSH', 'git push origin unit/U-1': 'allow' });
});

test('U70/AC-2 #4 merge shapes of a unit branch onto the base go through aidlc merge', () => {
  const dir = project();
  const wt = unitWorktree(dir);
  expect(dir, {
    'git merge refs/heads/unit/U-1': 'deny GUARD-MERGE',
    'git pull . unit/U-1': 'deny GUARD-MERGE',
    'git cherry-pick main..unit/U-1': 'deny GUARD-MERGE',
    'git rebase unit/U-1': 'deny GUARD-MERGE',
    'git reset --hard unit/U-1': 'deny GUARD-MERGE',
    'git log main..unit/U-1': 'allow',
  });
  expect(wt, { 'git rebase main': 'allow', 'git cherry-pick unit/U-2': 'allow' });
});

test('U70/AC-2 #11 #12 a hook run by hand and a nested claude -p that approves are denied', () => {
  const dir = project();
  expect(dir, {
    'echo "{}" | node .aidlc/bin/aidlc.mjs hook prompt': 'deny GUARD-HOOK',
    'aidlc hook guard < in.json': 'deny GUARD-HOOK',
    'node ~/.claude/plugins/x/plugin/hooks/run.mjs prompt': 'deny GUARD-HOOK',
    'claude -p "approve U-1"': 'deny GUARD-SCHEDULE',
    'claude --print "release I-1."': 'deny GUARD-SCHEDULE',
    'claude -p "summarise the log"': 'allow',
    'aidlc next': 'allow',
  });
});

test('U70/AC-2 #6 #13 a unit worktree writes only inside itself; no session writes the CLI state or the main personal profile', () => {
  const dir = project();
  const wt = unitWorktree(dir);
  const writeTo = (cwd, file_path, tool_name = 'Write') => call('scope', { cwd, tool_name, tool_input: { file_path, notebook_path: file_path, content: '{}\n' } });
  assert.match(writeTo(wt, resolve('/', 'aidlc-outside-temp', 'README.md')).reason, /^(escalate: )?SCOPE-OUT /);
  assert.equal(writeTo(wt, join(tempDir('report-'), 'report.json')).decision, 'allow', 'U79/AC-2 a report file in the temp folder, outside every checkout');
  assert.match(writeTo(wt, join(dir, 'src/a.mjs')).reason, /^(escalate: )?SCOPE-OUT /, 'the main checkout is outside the worktree');
  assert.equal(writeTo(wt, join(wt, 'src/b.mjs')).decision, 'allow');
  for (const cwd of [dir, wt]) {
    for (const tool of ['Write', 'Edit', 'NotebookEdit']) assert.match(writeTo(cwd, join(dir, '.git/aidlc/goes.json'), tool).reason, /^(escalate: )?SCOPE-STATE /, `${cwd} ${tool}`);
    assert.match(writeTo(cwd, join(dir, '.git/aidlc/cards/U-1.json')).reason, /^(escalate: )?SCOPE-STATE /);
    assert.match(writeTo(cwd, join(dir, '.aidlc/local/profile.json')).reason, /^(escalate: )?SCOPE-APPROVAL /);
  }
});

test('U70/AC-2 #7 secrets: a notebook cell and an unquoted KEY=value are denied; the gate scans the unit diff\'s added lines', () => {
  const dir = project();
  const scan = (tool_name, tool_input) => call('secrets', { cwd: dir, tool_name, tool_input });
  assert.equal(scan('NotebookEdit', { notebook_path: join(dir, 'n.ipynb'), new_source: `key = "${AWS}"` }).decision, 'deny');
  assert.equal(scan('Write', { file_path: join(dir, '.env'), content: `AWS_SECRET_ACCESS_KEY=${'wJalrXUtnFEMI/K7MDENG'}0bPxRfiCY\n` }).decision, 'deny');
  assert.equal(scan('Write', { file_path: join(dir, '.env'), content: `export DEPLOY_TOKEN=${'ab12'.repeat(5)}\n` }).decision, 'deny');
  for (const content of ['password=generatePasswordHashNow\n', 'DB_PASSWORD=${{ secrets.DB }}\n', 'const token = readTokenFromEnvironment1();\n']) {
    assert.equal(scan('Write', { file_path: join(dir, 'x.mjs'), content }).decision, 'allow', content);
  }
  const gated = setup({ files: { 'src/add.mjs': `export const add = (a, b) => a + b;\nexport const key = '${AWS}';\n` } });
  const r = merge(gated);
  assert.ok(codes(r).includes('GATE-SECRET'), r.out);
  assert.match(r.out, /src\/add\.mjs:2 adds what looks like a secret/);
});

test('U70/AC-2 #16 a merge whose Unit trailer names no unit in the plan fails push and check --ci', () => {
  const dir = setup();
  const remote = tempDir('remote-');
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'switch', '-q', '-c', 'forged');
  commit(dir, 'forged work', { 'docs/notes.md': 'x\n' });
  git(dir, 'switch', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', 'forged', '-m', 'Merge U-99', '-m', 'Unit: U-99\nCard: x\nReview: pass\nTested: none\nProof: none');
  let r = run(dir, ['push']);
  assert.equal(r.code, 1);
  assert.match(r.out, /PUSH-COMMIT merge \w+ names U-99, a unit not in the plan/);
  r = run(dir, ['check', '--ci']);
  assert.match(r.out, /CI-MERGE merge \w+ names U-99, a unit not in the plan/);
});
