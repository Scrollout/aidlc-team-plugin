// M20 B191: the diagrams are drawn from the data the CLI enforces, so they cannot drift from it (DOC-DIAGRAM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/index.mjs';
import { CODES, DIR, TABLES, dirOf, pages, workflow } from './diagrams.mjs';

test('B191/AC-1 each generated diagram page matches the data it is drawn from (rewrite them with node tests/diagrams.mjs)', () => {
  const want = pages();
  assert.deepEqual([DIR, TABLES].flatMap((d) => readdirSync(d).filter((f) => f !== 'index.md')).sort(), Object.keys(want).sort());
  for (const [name, text] of Object.entries(want)) assert.equal(readFileSync(join(dirOf(text), name), 'utf8'), text, `DOC-DIAGRAM ${name} differs from its data, or sits in the wrong folder`);
});

test('B191/AC-1 the state diagrams name the states the CLI derives', () => {
  const M = config.state.machines, named = (m) => [...new Set(M[m].transitions.flatMap((t) => [t.from, t.to]))], derived = (m) => [...new Set(M[m].derive.map((r) => r.state))];
  assert.deepEqual(named('bolt').sort(), derived('bolt').sort(), 'every bolt state drawn is one the machine derives, and each derived state is drawn');
  // After the merge an intent moves through the release steps the deploy records hold; its derived states are all drawn.
  for (const s of derived('intent')) assert.ok(named('intent').includes(s), s);
});

test('B191/AC-2 no hand-drawn diagram is left where a generated one replaced it', () => {
  for (const f of ['state.md', 'intent-states.md', 'grid.md']) assert.doesNotMatch(readFileSync(join(import.meta.dirname, '../docs/design', f), 'utf8'), /```mermaid/, f);
});

test('B192/AC-1 every check code is documented on exactly one page, and every code a design doc names exists (DOC-CODE)', () => {
  const tables = CODES.map(([, , table]) => config[table].codes), codes = tables.flatMap((t) => Object.keys(t));
  const pagesOf = (code) => CODES.filter(([name]) => new RegExp(`\`${code}\``).test(readFileSync(join(TABLES, `codes-${name}.md`), 'utf8')));
  assert.deepEqual(codes.filter((c) => pagesOf(c).length !== 1), [], 'a code on no page or on two');
  // A refusal the CLI prints with its code as the message's prefix counts as a code too.
  const known = new Set([...codes, ...Object.values(config.messages).map((m) => m.match(/^([A-Z]+(?:-[A-Z0-9]+)+): /)?.[1]).filter(Boolean)]);
  const design = join(import.meta.dirname, '../docs/design');
  // A draft design doc describes codes still to build; a stable one names only codes that exist.
  const named = readdirSync(design, { recursive: true }).filter((f) => f.endsWith('.md') && !/^status: draft$/m.test(readFileSync(join(design, f), 'utf8'))).flatMap((f) => [...readFileSync(join(design, f), 'utf8').matchAll(/`([A-Z]{2,}(?:-[A-Z][A-Z0-9]*)+)`/g)].map((m) => [f, m[1]]));
  const format = (c) => c.split('-').every((seg) => new Set(seg).size === 1); // a placeholder such as YYYY-MM-DD
  assert.deepEqual(named.filter(([, c]) => !known.has(c) && !format(c)).map(([f, c]) => `${f}: ${c}`), []);
});

test('B196/AC-1 the README draws the generated workflow', () => {
  const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8');
  assert.equal(readme.split('<!-- generated: workflow -->\n')[1].split('<!-- /generated -->')[0], workflow(), 'DOC-DIAGRAM README.md: rewrite its block with node tests/diagrams.mjs');
});
