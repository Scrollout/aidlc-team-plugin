// M26 B241: each shipped package sits at the top of the plugin folder and is found through one resolver; a project
// pins every package beside the CLI (docs/design/layout.md, decision 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/index.mjs';
import { spawnSync } from 'node:child_process';
import { CHILD_ENV, makeRepo, run } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const ENGINE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/layout.json'), 'utf8'));
const sources = (dir) => readdirSync(join(ROOT, dir), { recursive: true }).filter((f) => f.endsWith('.mjs')).map((f) => join(dir, f));

test('B241/AC-1 the CLI folder holds the engine only, each package its own folder, and no lookup goes around the resolver', () => {
  assert.deepEqual(readdirSync(join(ROOT, 'plugin/cli')).sort(), ENGINE.engine, 'templates, personas and models live in their packages');
  for (const { dir } of Object.values(config.packages)) assert.ok(existsSync(join(ROOT, 'plugin', dir)), dir);
  assert.ok(existsSync(join(ROOT, 'plugin/models/control-plane/reference/go/go.mod')), 'a model keeps its reference code');
  const around = new RegExp(ENGINE.around);
  const found = sources('plugin/cli').flatMap((f) => readFileSync(join(ROOT, f), 'utf8').split('\n').map((l, k) => [f, k + 1, l]).filter(([, , l]) => around.test(l)).map(([f, n]) => `${f}:${n}`));
  assert.deepEqual(found, [], 'a package file is found through packageFile or shippedDir');
});

test('B241/AC-2 init pins every package beside the CLI, a project file at the same path wins, and the old packs folder goes', () => {
  const dir = makeRepo({}, {});
  assert.equal(run(dir, ['upgrade', '--dirty']).code, 0);
  for (const { dir: d } of Object.values(config.packages)) assert.ok(existsSync(join(dir, '.aidlc/bin', d)), `${d} pinned`);
  assert.ok(!existsSync(join(dir, '.aidlc/packs')), 'the old packs folder is gone');
  const pinned = (args) => spawnSync(process.execPath, [join(dir, '.aidlc/bin/aidlc.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: CHILD_ENV }).stdout;
  assert.match(pinned(['persona', 'architect']), /^name: architect$/m, 'the pinned CLI reads its pinned personas');
  assert.match(pinned(['models']), /^control-plane \(shipped\)/, 'and its pinned models');
});
