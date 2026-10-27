import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, commit, git, intentDoc, makeRepo, review, run, TMP, unitDoc } from './state-repo.mjs';
import { config } from '../plugin/cli/lib/index.mjs';

const ROOT = join(import.meta.dirname, '..');

test('U13/AC-1 only the shared helper makes temp folders', () => {
  for (const name of readdirSync(join(ROOT, 'tests')).filter((n) => n.endsWith('.mjs') && !['state-repo.mjs', 'hygiene.test.mjs'].includes(n))) {
    assert.doesNotMatch(readFileSync(join(ROOT, 'tests', name), 'utf8'), /mkdtemp|tmpdir\(/, `${name} makes its own temp folder`);
  }
});

test('U13/AC-1 a failing test process still removes its temp root', () => {
  const script = `import(${JSON.stringify(new URL('./state-repo.mjs', import.meta.url).href)}).then((m) => { m.tempDir('x-'); process.stdout.write(m.TMP); throw new Error('boom'); });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.ok(r.stdout && !existsSync(r.stdout), `${r.stdout} is left behind`);
});

test('U13/AC-1 a merge, passing or refused, leaves no trial worktree folder', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unitDoc({ scope: ['src/**'] }) });
  approve(dir, 'I-1', 'U-1');
  run(dir, ['card', 'U-1']);
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'work', { 'src/a.txt': 'U-1/AC-1\n' });
  git(dir, 'switch', '-q', 'main');
  assert.equal(run(dir, ['merge', 'U-1']).code, 1, 'refused: no review');
  review(dir, 'U-1', 'pass');
  assert.equal(run(dir, ['merge', 'U-1']).code, 0);
  assert.deepEqual(readdirSync(TMP).filter((n) => n.startsWith('gate-')), []);
});

// M20 B195: no dead code: every export is used outside its file, and the v1 aliases go when they expire.
const all = (dir) => readdirSync(join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith('.mjs')).map((f) => `${dir}/${f}`);
const src = Object.fromEntries([...all('plugin/cli'), ...all('tests'), 'plugin/hooks/run.mjs'].map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));

test('B195/AC-1 every export of the CLI is used by another module, the entry or a test', () => {
  const unused = all('plugin/cli').flatMap((f) => [...src[f].matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map((m) => m[1])
    .filter((name) => !Object.entries(src).some(([g, t]) => g !== f && new RegExp(`\\b${name}\\b`).test(t))).map((name) => `${f}: ${name}`));
  assert.deepEqual(unused, []);
});

test('B195/AC-1 the v1 aliases (units/, U-<n>) are gone once the milestone they expire with is built', () => {
  const roadmap = join(ROOT, 'docs/roadmap', `${config.grid.legacyUntil.toLowerCase()}.md`);
  const built = existsSync(roadmap) && /^status: stable$/m.test(readFileSync(roadmap, 'utf8')); // the whole milestone, not one bolt of it
  assert.ok(!built || !config.grid.units, `${config.grid.legacyUntil} is built: remove the units/ alias`);
});
