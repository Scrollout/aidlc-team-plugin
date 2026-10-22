import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProfile, mergeLayers, ProfileError } from '../plugin/cli/lib/profile.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'profile-'));
  for (const [rel, data] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), typeof data === 'string' ? data : JSON.stringify(data));
  }
  return dir;
}

test('U1/AC-2 layers merge in order: plugin, project, personal', () => {
  const dir = fixture({
    'cli/defaults.json': { base: 'main', parallel: { max: 2 }, docs: { bundle: 'docs' } },
    'repo/.aidlc/profile.json': { name: 'example', parallel: { max: 3 } },
    'repo/.aidlc/local/profile.json': { parallel: { max: 1 } },
    'repo/.aidlc/rules/b.md': '# b',
    'repo/.aidlc/rules/a.md': '# a',
  });
  const { profile, layers, rules } = loadProfile(join(dir, 'repo'), { cliDir: join(dir, 'cli') });
  assert.deepEqual(profile, { base: 'main', parallel: { max: 1 }, docs: { bundle: 'docs' }, name: 'example' });
  assert.deepEqual(layers, ['plugin', 'project', 'personal']);
  assert.deepEqual(rules.map((r) => r.slice(-4)), ['a.md', 'b.md']);
});

test('U1/AC-2 a deny from an earlier layer survives a later override', () => {
  const merged = mergeLayers([
    { name: 'plugin', data: { deny: ['force-push'], guard: { deny: ['git push --force'], max: 1 } } },
    { name: 'project', data: { deny: ['tag'], guard: { deny: [], max: 2 } } },
    { name: 'personal', data: { guard: { deny: ['git push --force'] } } },
  ]);
  assert.deepEqual(merged.deny, ['force-push', 'tag']);
  assert.deepEqual(merged.guard, { deny: ['git push --force'], max: 2 });
});

test('U1/AC-2 removing a deny is refused with the layer and key', () => {
  const plugin = { name: 'plugin', data: { guard: { deny: ['x'] } } };
  assert.throws(() => mergeLayers([plugin, { name: 'personal', data: { guard: { deny: null } } }]), (e) =>
    e instanceof ProfileError && /personal: guard\.deny/.test(e.message));
  assert.throws(() => mergeLayers([plugin, { name: 'project', data: { guard: false } }]), (e) =>
    e instanceof ProfileError && /project: guard /.test(e.message));
});

test('U1/AC-2 missing layers are empty; invalid JSON names the file', () => {
  const empty = fixture({});
  assert.deepEqual(loadProfile(empty, { cliDir: join(empty, 'none') }), { profile: {}, layers: [], rules: [] });
  const bad = fixture({ '.aidlc/profile.json': '{ nope' });
  assert.throws(() => loadProfile(bad, { cliDir: join(bad, 'none') }), /\.aidlc\/profile\.json: invalid JSON/);
});
