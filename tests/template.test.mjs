import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, renderFile, TemplateError } from '../plugin/cli/lib/template.mjs';
import { tempDir } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');

test('U1/AC-3 renders {{a.b}}', () => {
  assert.equal(render('base {{ profile.base }}, bundle {{profile.docs.bundle}}', { profile: { base: 'main', docs: { bundle: 'docs' } } }),
    'base main, bundle docs');
});

test('U1/AC-3 renders {{#each}} with item fields, this and outer names', () => {
  const data = { base: 'main', modules: [{ id: 'api', paths: ['a/**', 'b/**'] }, { id: 'web', paths: ['c/**'] }] };
  const t = '{{#each modules}}- {{id}} on {{base}}:{{#each paths}} {{this}}{{/each}}\n{{/each}}';
  assert.equal(render(t, data), '- api on main: a/** b/**\n- web on main: c/**\n');
  assert.equal(render('[{{#each list}}x{{/each}}]', { list: [] }), '[]');
});

test('U1/AC-3 a missing variable is an error naming it', () => {
  assert.throws(() => render('x {{profile.nope}}', { profile: {} }, 'AGENTS.md'), (e) =>
    e instanceof TemplateError && e.message === 'AGENTS.md: missing variable profile.nope');
  assert.throws(() => render('{{#each mods}}{{/each}}', {}), /missing variable mods/);
  assert.throws(() => render('{{#each list}}{{nope}}{{/each}}', { list: [{}] }), /missing variable nope/);
  assert.throws(() => render('{{#each list}}x', { list: [] }), /not closed/);
  assert.throws(() => render('{{a}}', { a: { b: 1 } }), /a is not a scalar/);
});

test('U1/AC-3 a project override file wins over the plugin template', () => {
  const dir = tempDir('template-');
  const pluginDir = join(dir, 'plugin');
  const root = join(dir, 'repo');
  mkdirSync(join(pluginDir, 'templates/docs'), { recursive: true });
  mkdirSync(join(root, '.aidlc/templates/docs'), { recursive: true });
  writeFileSync(join(pluginDir, 'templates/docs/intent.md'), 'plugin {{name}}');
  writeFileSync(join(pluginDir, 'templates/AGENTS.md'), 'plugin agents {{name}}');
  writeFileSync(join(root, '.aidlc/templates/docs/intent.md'), 'project {{name}}');
  assert.equal(renderFile('docs/intent.md', { name: 'x' }, { root, pluginDir }), 'project x');
  assert.equal(renderFile('AGENTS.md', { name: 'x' }, { root, pluginDir }), 'plugin agents x');
  assert.throws(() => renderFile('nope.md', {}, { root, pluginDir }), /template not found: nope\.md/);
});

test('files shipped into projects never name the plugin', () => {
  const name = JSON.parse(readFileSync(join(ROOT, 'plugin/.claude-plugin/plugin.json'), 'utf8')).name;
  const walk = (d) => readdirSync(d, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath ?? e.path, e.name));
  const shipped = ['plugin/cli', 'plugin/templates'].flatMap((d) => { try { return walk(join(ROOT, d)); } catch { return []; } });
  assert.ok(shipped.length > 0);
  for (const f of shipped) assert.ok(!readFileSync(f, 'utf8').toLowerCase().includes(name.toLowerCase()), `${f} names ${name}`);
});
