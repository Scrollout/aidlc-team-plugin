import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const CLI = join(ROOT, 'plugin/cli/aidlc.mjs');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// Command names from the first column of the table in docs/design/cli.md.
function documentedCommands() {
  const md = readFileSync(join(ROOT, 'docs/design/cli.md'), 'utf8');
  const names = [];
  for (const line of md.split('\n')) {
    const cell = line.match(/^\|\s*(`[^|]*)\|/);
    if (cell) for (const m of cell[1].matchAll(/`([a-z-]+)/g)) names.push(m[1]);
  }
  return names;
}

test('U1/AC-1 --help lists every command in the CLI design', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  const names = documentedCommands();
  assert.ok(names.length >= 20, `parsed ${names.length} commands`);
  for (const name of names) assert.match(r.stdout, new RegExp(`^  ${name}\\b`, 'm'), `${name} missing from --help`);
});

test('U1/AC-1 cli.json matches the CLI design: commands and exit codes', () => {
  const config = readJson('plugin/cli/cli.json');
  assert.deepEqual(config.commands.map((c) => c.name).sort(), documentedCommands().sort());
  const md = readFileSync(join(ROOT, 'docs/design/cli.md'), 'utf8');
  const line = md.split('# Exit codes')[1].trim().split('\n')[0];
  const codes = [...line.matchAll(/`(\d+)`/g)].map((m) => Number(m[1]));
  assert.deepEqual(Object.values(config.exit).sort((a, b) => a - b), codes);
});

test('every message the CLI uses is defined in cli.json, and none is unused', () => {
  const { messages } = readJson('plugin/cli/cli.json');
  const files = ['plugin/cli/aidlc.mjs', ...readdirSync(join(ROOT, 'plugin/cli/lib')).map((f) => `plugin/cli/lib/${f}`)];
  const code = files.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  const used = [...code.matchAll(/(?:msg|fail|yerr)\('(\w+)'|add\([^;]*?'[A-Z]+-[A-Z-]+', '(\w+)'/g)].map((m) => m[1] ?? m[2]);
  for (const key of used) assert.ok(key in messages, `${key} is used but not defined`);
  for (const key of Object.keys(messages)) assert.ok(code.includes(`'${key}'`), `${key} is defined but never used`);
});

test('U1/AC-1 unknown command exits 64', () => {
  const r = run('frobnicate');
  assert.equal(r.status, 64);
  assert.match(r.stderr, /unknown command: frobnicate/);
  assert.equal(run().status, 64);
});

test('U1/AC-1 a documented command not built yet exits 70', () => {
  assert.equal(run('hold').status, 70);
});

test('U1/AC-5 CI runs the tests and the docs check on every push', () => {
  const yml = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  assert.match(yml, /^on:\s*\n(\s+[\w_]+:\s*\n)*\s+push:/m);
  assert.doesNotMatch(yml, /branches/, 'push must not be limited to branches');
  assert.match(yml, /run: node --test$/m);
  assert.match(yml, /run: node plugin\/cli\/aidlc\.mjs check docs$/m);
  assert.match(yml, /node-version: 20/);
});

test('U1/AC-6 marketplace entry points at ./plugin with the manifest name', () => {
  const market = readJson('.claude-plugin/marketplace.json');
  const manifest = readJson('plugin/.claude-plugin/plugin.json');
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].source, './plugin');
  assert.equal(market.plugins[0].name, manifest.name);
  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.notEqual(manifest.name, 'aidlc', 'aidlc is the CLI and folder name in every project');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(market.plugins[0].version, undefined, 'version lives only in plugin.json');
});

test('a release tag matches the plugin.json version', (t) => {
  if (process.env.GITHUB_REF_TYPE !== 'tag') return t.skip('not a tag build');
  const { name, version } = readJson('plugin/.claude-plugin/plugin.json');
  assert.ok([`v${version}`, `${name}--v${version}`].includes(process.env.GITHUB_REF_NAME), process.env.GITHUB_REF_NAME);
});

test('plugin/ never changes under an already tagged version', (t) => {
  const { version } = readJson('plugin/.claude-plugin/plugin.json');
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try { git('rev-parse', '-q', '--verify', `refs/tags/v${version}`); } catch { return t.skip(`v${version} not tagged yet`); }
  assert.equal(git('diff', '--name-only', `v${version}`, '--', 'plugin/'), '', `plugin/ changed since v${version}; bump version in plugin.json`);
});

test('U1/AC-6 claude plugin validate . passes', (t) => {
  if (spawnSync('claude', ['--version']).status !== 0) return t.skip('claude CLI not installed');
  const out = execFileSync('claude', ['plugin', 'validate', '.'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /Validation passed/);
  assert.doesNotMatch(out, /warning/i);
});
