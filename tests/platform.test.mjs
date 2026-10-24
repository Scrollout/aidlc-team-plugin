import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, branch, commit, hook, intentDoc, pinnedRepo, read, run, tempDir, unitDoc } from './state-repo.mjs';

const U1 = 'docs/units/U-1-export.md';

// A project in a folder whose path has spaces (and, on Windows, a drive letter and maybe a short name).
function spaced() {
  const parent = join(tempDir('with space-'), 'my projects');
  mkdirSync(parent);
  const dir = pinnedRepo({ 'docs/intents/I-1-pricing.md': intentDoc('I-1'), [U1]: unitDoc({ scope: ['src/**'] }) }, {}, parent); // the hooks run the pinned CLI
  approve(dir, 'I-1', 'U-1');
  return dir;
}

test('U12/AC-2 paths in output and cards use / on every platform', () => {
  const dir = spaced();
  const card = run(dir, ['card', 'U-1']);
  assert.equal(card.code, 0, card.err);
  const next = run(dir, ['fix', 'Typo in guide', '--scope', 'docs/guide/**']);
  assert.equal(next.code, 0, next.err);
  assert.match(next.out, /^wrote docs\/units\/U-2-typo-in-guide\.md/);
  for (const out of [card.out, next.out, next.err, run(dir, ['status']).out]) assert.doesNotMatch(out, /\\/, out);
});

test('U12/AC-3 the CLI and hooks run from a path with spaces, and a CRLF doc keeps its approval', () => {
  const dir = spaced();
  branch(dir, 'U-1');
  const r = run(dir, ['next']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^restart the builder of U-1|^build U-1|^wait/);
  const guard = hook('guard', { cwd: dir, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status' } });
  assert.equal(guard.code, 0, guard.err);
  writeFileSync(join(dir, U1), read(dir, U1).replace(/\n/g, '\r\n'));
  commit(dir, 'CRLF checkout');
  assert.match(run(dir, ['status']).out, /U-1 (building|approved)/, 'line ends alone never stale an approval');
});
