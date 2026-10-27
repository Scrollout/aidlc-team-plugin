// M20 B211: the plugin's changelog follows Keep a Changelog 1.1.0 and SemVer (docs/design/standards.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TYPES = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

test('B211/AC-1 CHANGELOG.md has an Unreleased section, each release newest first with its date, only the six change types, and the plugin\'s version', () => {
  const text = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(text, /Semantic Versioning/);
  const heads = [...text.matchAll(/^## (.*)$/gm)].map((m) => m[1]);
  assert.equal(heads[0], '[Unreleased]');
  const versions = heads.slice(1).map((h) => h.match(/^\[(\d+)\.(\d+)\.(\d+)\] - \d{4}-\d{2}-\d{2}$/));
  assert.ok(versions.every(Boolean), heads.join('\n'));
  const order = versions.map((m) => m.slice(1).map(Number));
  const newer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  for (let k = 1; k < order.length; k++) assert.ok(newer(order[k - 1], order[k]) > 0, `${order[k - 1].join('.')} before ${order[k].join('.')}`);
  assert.deepEqual([...text.matchAll(/^### (.*)$/gm)].map((m) => m[1]).filter((t) => !TYPES.includes(t)), []);
  const { version } = JSON.parse(readFileSync(join(ROOT, 'plugin/.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(heads[1].match(/^\[([^\]]+)\]/)[1], version, 'the newest release is the plugin\'s version');
  for (const v of heads.slice(1).map((h) => h.match(/^\[([^\]]+)\]/)[1])) assert.match(text, new RegExp(`^\\[${v.replace(/\./g, '\\.')}\\]: `, 'm'), `${v} has a link`);
});
