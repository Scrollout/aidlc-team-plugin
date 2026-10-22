import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { approve, branch, commit, git, intentDoc, makeRepo, read, review, run, unitDoc, write } from './state-repo.mjs';
import { writeIndexes } from '../plugin/cli/lib/okf.mjs';

const ROOT = join(import.meta.dirname, '..');
const U = (n) => `docs/units/U-${n}-u.md`;
const stats = (dir) => JSON.parse(read(dir, '.git/aidlc/stats.json'));

test('U19/AC-2 check on a folder below the bundle root resolves bundle-root links from the root', () => {
  const doc = (link) => `---\ntype: Design\ntitle: D\ndescription: A design.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\nSee [it](${link}).\n`;
  const dir = makeRepo({ 'docs/design/d.md': doc('/intents/I-1-x.md'), 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/design/e.md': doc('/intents/none.md') });
  writeIndexes(join(dir, 'docs'));
  const r = run(dir, ['check', 'docs/design']);
  const links = r.out.split('\n').filter((l) => l.includes('HOUSE-LINK'));
  assert.deepEqual(links.map((l) => l.split(' ')[0]), ['docs/design/e.md:8'], r.out);
  assert.doesNotMatch(r.out, /docs\/intents\//, 'only the folder asked for is reported');
});

test('U19/AC-3 a hand-written description line for a new subfolder survives regeneration', () => {
  const dir = makeRepo({ 'docs/runbooks/api.md': '---\ntype: Runbook\ntitle: API\ndescription: The API runbook.\n---\n' });
  writeIndexes(join(dir, 'docs'));
  assert.match(read(dir, 'docs/index.md'), /^\* \[runbooks\]\(runbooks\/index\.md\) - The API runbook\.$/m, 'one entry: its description, as the reference');
  write(dir, { 'docs/index.md': read(dir, 'docs/index.md').replace('- The API runbook.', '- one runbook per component that runs. Load when operating it.') });
  writeIndexes(join(dir, 'docs'));
  assert.match(read(dir, 'docs/index.md'), /^\* \[runbooks\]\(runbooks\/index\.md\) - one runbook per component that runs\. Load when operating it\.$/m);
});

test('U19/AC-4 U19/AC-5 the counters feed aidlc retro, which lists, proposes at most three changes and resets them', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), [U(1)]: unitDoc(), [U(2)]: unitDoc({ scope: ['lib/**'] }) });
  approve(dir, 'I-1', 'U-1', 'U-2');
  branch(dir, 'U-1');
  review(dir, 'U-1', 'fix', [{ path: 'src/U-1.txt', line: 1, claim: 'x', scenario: 'y', confidence: 'CONFIRMED' }]);
  review(dir, 'U-1', 'fix');
  run(dir, ['report', 'U-2'], '{"status": "stopped", "stop": "the scope is too small"}');
  for (let k = 0; k < 3; k++) run(dir, ['merge', 'U-1']);
  const hook = (command) => spawnSync(process.execPath, [join(ROOT, 'plugin/cli/aidlc.mjs'), 'hook', 'guard'], { cwd: dir, encoding: 'utf8', input: JSON.stringify({ session_id: 's', cwd: dir, tool_input: { command } }) });
  for (let k = 0; k < 3; k++) hook('git push --force origin unit/U-1');
  write(dir, { '.git/aidlc/prompts.json': [{ id: 't1', command: 'approve U-1', at: '2026-10-23T10:00:00Z' }] });
  spawnSync(process.execPath, [join(ROOT, 'plugin/cli/aidlc.mjs'), 'hook', 'heartbeat'], { cwd: dir, input: JSON.stringify({ cwd: dir, tool_use_id: 't1' }) });

  const counted = stats(dir);
  assert.equal(counted.codes['GATE-REVIEW'], 3);
  assert.equal(counted.codes['GUARD-FORCE'], 3);
  assert.deepEqual(counted.escalations, { review: 1, stopped: 1, denials: 1 });
  assert.equal(counted.interventions[0].command, 'approve U-1');

  const r = run(dir, ['retro', 'I-1']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^codes fired 3 or more times:\n( {2}\S+ 3\n)+escalations:/m);
  assert.match(r.out, /^ {2}GATE-REVIEW 3$/m);
  assert.match(r.out, /^ {2}U-1 review general escalated with 0 findings at \S+$/m);
  assert.match(r.out, /^ {2}U-2 builder stopped at \S+: the scope is too small$/m);
  assert.match(r.out, /^ {2}1 repeated hook denials escalated to the owner$/m);
  assert.match(r.out, /^owner commands that ran:\n {2}\S+ approve U-1$/m);
  const proposals = r.out.split('proposals (the owner accepts or rejects each):\n')[1].split('counters reset')[0].trim().split('\n').map((p) => p.trim());
  assert.ok(proposals.length >= 1 && proposals.length <= 3, proposals.join('\n'));
  assert.ok(proposals.every((p) => /^(profile glob|project rule|template tweak|new check): /.test(p)), proposals.join('\n'));
  assert.deepEqual(proposals, [
    'project rule: GATE-CARD fired 3 times: in .aidlc/rules/lead.md, run aidlc merge only when aidlc next offers it',
    'project rule: GATE-REVIEW fired 3 times: in .aidlc/rules/lead.md, run aidlc merge only when aidlc next offers it',
    'project rule: GUARD-FORCE fired 3 times: in .aidlc/rules/lead.md, write down the command the lead should use instead',
  ], 'the three most frequent, not the escalation reasons beyond them');
  assert.deepEqual(Object.keys(stats(dir)), ['since'], 'the retro resets the counters');
  assert.match(run(dir, ['retro', 'I-1']).out, /^codes fired 3 or more times:\n {2}none$/m);
  assert.equal(run(dir, ['retro', 'I-9']).code, 64);
});
