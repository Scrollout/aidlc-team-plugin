// M20 B191: the diagrams are drawn from the data the CLI enforces, so they cannot drift from it (DOC-DIAGRAM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/index.mjs';
import { CODES, DIR, pages, workflow } from './diagrams.mjs';

test('B191/AC-1 each generated diagram page matches the data it is drawn from (rewrite them with node tests/diagrams.mjs)', () => {
  const want = pages();
  assert.deepEqual(readdirSync(DIR).filter((f) => f !== 'index.md').sort(), Object.keys(want).sort());
  for (const [name, text] of Object.entries(want)) assert.equal(readFileSync(join(DIR, name), 'utf8'), text, `DOC-DIAGRAM ${name} differs from its data`);
});

test('B191/AC-1 the state diagrams name the states the CLI derives', () => {
  const code = ['flow', 'review', 'approval'].map((m) => readFileSync(join(import.meta.dirname, `../plugin/cli/lib/domains/${m}.mjs`), 'utf8')).join('\n');
  const named = (rows) => [...new Set(rows.flatMap(([a, b]) => [a, b]))];
  assert.deepEqual(named(config.state.transitions).filter((s) => !code.includes(`'${s}'`)), [], 'every bolt state in the diagram is one the code sets');
  // After the merge an intent moves through the release steps the deploy records hold; its derived states are all drawn.
  for (const s of ['draft', 'approved', 'stale', 'merged', 'released']) assert.ok(named(config.state.intentTransitions).includes(s), s);
});

test('B191/AC-2 no hand-drawn diagram is left where a generated one replaced it', () => {
  for (const f of ['state.md', 'intent-states.md', 'grid.md']) assert.doesNotMatch(readFileSync(join(import.meta.dirname, '../docs/design', f), 'utf8'), /```mermaid/, f);
});

test('B192/AC-1 every check code is documented on exactly one page, and every code a design doc names exists (DOC-CODE)', () => {
  const tables = CODES.map(([, , table]) => config[table].codes), codes = tables.flatMap((t) => Object.keys(t));
  const pagesOf = (code) => CODES.filter(([name]) => new RegExp(`\`${code}\``).test(readFileSync(join(DIR, `codes-${name}.md`), 'utf8')));
  assert.deepEqual(codes.filter((c) => pagesOf(c).length !== 1), [], 'a code on no page or on two');
  // A refusal the CLI prints with its code as the message's prefix counts as a code too.
  const known = new Set([...codes, ...Object.values(config.messages).map((m) => m.match(/^([A-Z]+(?:-[A-Z0-9]+)+): /)?.[1]).filter(Boolean)]);
  const design = join(import.meta.dirname, '../docs/design');
  const named = readdirSync(design, { recursive: true }).filter((f) => f.endsWith('.md')).flatMap((f) => [...readFileSync(join(design, f), 'utf8').matchAll(/`([A-Z]{2,}(?:-[A-Z][A-Z0-9]*)+)`/g)].map((m) => [f, m[1]]));
  const format = (c) => c.split('-').every((seg) => new Set(seg).size === 1); // a placeholder such as YYYY-MM-DD
  assert.deepEqual(named.filter(([, c]) => !known.has(c) && !format(c)).map(([f, c]) => `${f}: ${c}`), []);
});

test('B196/AC-1 the README draws the generated workflow', () => {
  const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8');
  assert.equal(readme.split('<!-- generated: workflow -->\n')[1].split('<!-- /generated -->')[0], workflow(), 'DOC-DIAGRAM README.md: rewrite its block with node tests/diagrams.mjs');
});
