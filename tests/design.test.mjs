import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintPlan } from '../plugin/cli/lib/grid.mjs';
import { approve, intentDoc, makeRepo, read, run, unitDoc } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const PROFILE = { lanes: { full: ['migrations/**'], quick: ['docs/**'] } };
const DOMAIN = '\n# Domain\nPrice is owned by pricing; billing reads it.\n';
const LOGICAL = '\n# Logical\n`PriceService.Quote(sku)` returns a Money.\n';
const unit = (scope, body = '', design = '') => unitDoc({ scope, design, extra: body, twoWay: 'a test migration' });
const designFindings = (dir) => lintPlan(join(dir, 'docs'), PROFILE, { base: dir }).filter((f) => f.code === 'PLAN-DESIGN').map((f) => [f.path, f.message]);

test('U72/AC-1 plan lint asks a full-lane unit for Domain and Logical, a standard one for Logical, before approval', () => {
  const dir = makeRepo({
    'docs/intents/I-1-p.md': intentDoc('I-1'),
    'docs/units/U-1-a.md': unit(['migrations/**']),
    'docs/units/U-2-b.md': unit(['migrations/**'], LOGICAL),
    'docs/units/U-3-c.md': unit(['src/**']),
    'docs/units/U-4-d.md': unit(['src/**'], LOGICAL),
    'docs/units/U-5-e.md': unit(['migrations/**'], DOMAIN + LOGICAL),
    'docs/units/U-6-f.md': unit(['src/**'], '', 'only renames a field'),
    'docs/units/U-7-g.md': unit(['docs/**']),
    'docs/units/U-8-h.md': unit(['src/**'], '\n# Logical\n'),
  }, PROFILE);
  assert.deepEqual(designFindings(dir).map(([p, m]) => [p.replace('docs/units/', ''), m]), [
    ['U-1-a.md', 'U-1 is full lane and has no # Domain section with content'],
    ['U-1-a.md', 'U-1 is full lane and has no # Logical section with content'],
    ['U-2-b.md', 'U-2 is full lane and has no # Domain section with content'],
    ['U-3-c.md', 'U-3 is standard lane and has no # Logical section with content'],
    ['U-8-h.md', 'U-8 is standard lane and has no # Logical section with content'],
  ], 'a design section with content passes; a reason waives it; the quick lane needs none; an empty heading counts for nothing');
  const fix = run(dir, ['fix', 'export drops a row', '--scope', 'migrations/**']);
  assert.match(fix.out, /^wrote docs\/units\/U-9-export-drops-a-row\.md/, fix.err);
  assert.match(read(dir, 'docs/units/U-9-export-drops-a-row.md'), /^design: "a regression fix: its test pins the behaviour"$/m, 'a fix unit carries its waiver');

  const approved = makeRepo({ 'docs/intents/I-1-p.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unit(['src/**']) });
  approve(approved, 'I-1', 'U-1');
  assert.deepEqual(designFindings(approved), [], 'a unit approved before the check is not reported');
});

test('U72/AC-2 the unit template carries both sections, the card names them and the reviewer checks against them', () => {
  const template = readFileSync(join(ROOT, 'plugin/templates/docs/unit.md'), 'utf8');
  assert.match(template, /^# Domain$/m);
  assert.match(template, /^# Logical$/m);
  assert.match(readFileSync(join(ROOT, 'plugin/agents/reviewer.md'), 'utf8'), /The card's design, requirement and interface docs\. Check the diff against each\./);

  const dir = makeRepo({ 'docs/intents/I-1-p.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unit(['migrations/**'], DOMAIN + LOGICAL), 'docs/units/U-2-b.md': unit(['src/**'], '', 'none') }, PROFILE);
  approve(dir, 'I-1', 'U-1', 'U-2');
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /^## Design \(build to it; every review checks it\)\nthe # Domain, Logical section\(s\) of docs\/units\/U-1-a\.md at the base$/m);
  assert.doesNotMatch(run(dir, ['card', 'U-2']).out, /## Design/, 'a waived unit has no design section');
});

test('B150/AC-2 the canonical model words table is the block generated from cli.json, and the overview points to it', async () => {
  const { glossary, withBlock } = await import('../plugin/cli/lib/vocab.mjs');
  const doc = readFileSync(join(ROOT, 'docs/design/canonical-model.md'), 'utf8');
  assert.equal(withBlock(doc, 'glossary', glossary()), doc);
  assert.match(readFileSync(join(ROOT, 'docs/design/overview.md'), 'utf8'), /# Glossary\n.*\[Canonical model\]\(canonical-model\.md#words\)/);
});

test('B150/AC-1 every vocabulary word has one scale, and the AI-DLC terms Intent, Unit and Bolt each map to exactly one word', async () => {
  const { config } = await import('../plugin/cli/lib/config.mjs');
  const words = config.vocabulary.words;
  assert.equal(new Set(words.map((w) => w.word)).size, words.length, 'one row per word');
  for (const term of ['Intent', 'Unit', 'Bolt']) assert.equal(words.filter((w) => w.method === `**${term}**`).length, 1, term);
  assert.match(readFileSync(join(ROOT, 'docs/design/method.md'), 'utf8'), /\[Canonical model\]\(canonical-model\.md\)/);
});
