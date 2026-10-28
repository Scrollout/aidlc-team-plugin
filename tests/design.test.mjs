import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintPlan } from '../plugin/cli/lib/index.mjs';
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
  assert.match(read(dir, 'docs/units/U-9-export-drops-a-row.md'), /^design: "a regression fix: its test pins the behaviour"$/m, 'a fix bolt carries its waiver');

  const approved = makeRepo({ 'docs/intents/I-1-p.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unit(['src/**']) });
  approve(approved, 'I-1', 'U-1');
  assert.deepEqual(designFindings(approved), [], 'a unit approved before the check is not reported');
});

test('U72/AC-2 the unit template carries both sections, the card names them and the reviewer checks against them', () => {
  const template = readFileSync(join(ROOT, 'plugin/templates/docs/bolt.md'), 'utf8');
  assert.match(template, /^# Domain$/m);
  assert.match(template, /^# Logical$/m);
  assert.match(readFileSync(join(ROOT, 'plugin/agents/reviewer.md'), 'utf8'), /The card's design, requirement and interface docs\. Check the diff against each\./);

  const dir = makeRepo({ 'docs/intents/I-1-p.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unit(['migrations/**'], DOMAIN + LOGICAL), 'docs/units/U-2-b.md': unit(['src/**'], '', 'none') }, PROFILE);
  approve(dir, 'I-1', 'U-1', 'U-2');
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /^## Design \(build to it; every review checks it\)\nthe # Domain, Logical section\(s\) of docs\/units\/U-1-a\.md at the base$/m);
  assert.doesNotMatch(run(dir, ['card', 'U-2']).out, /## Design/, 'a waived unit has no design section');
});

test('B150/AC-2 B254/AC-3 the canonical model links a words page for each scale and the words to avoid, and the overview points to it', async () => {
  const { config } = await import('../plugin/cli/lib/index.mjs');
  const doc = readFileSync(join(ROOT, 'docs/design/canonical-model.md'), 'utf8');
  for (const scale of new Set(config.vocabulary.words.map((w) => w.scale))) assert.match(doc, new RegExp(`\\(tables/words-${scale.toLowerCase()}\\.md\\)`), scale);
  assert.match(doc, /\(tables\/words-avoid\.md\)/);
  assert.match(readFileSync(join(ROOT, 'docs/design/overview.md'), 'utf8'), /# Glossary\n.*\[Canonical model\]\(canonical-model\.md#words\)/);
});

test('B150/AC-1 every vocabulary word has one scale, and the AI-DLC terms Intent, Unit and Bolt each map to exactly one word', async () => {
  const { config } = await import('../plugin/cli/lib/index.mjs');
  const words = config.vocabulary.words;
  assert.equal(new Set(words.map((w) => w.word)).size, words.length, 'one row per word');
  for (const term of ['Intent', 'Unit', 'Bolt']) assert.equal(words.filter((w) => w.method === `**${term}**`).length, 1, term);
  assert.match(readFileSync(join(ROOT, 'docs/design/method.md'), 'utf8'), /\[Canonical model\]\(canonical-model\.md\)/);
});

test('B158/AC-2 a design doc or roadmap is draft exactly while it names a bolt not yet built, and only a draft says Draft', async () => {
  const { readdirSync } = await import('node:fs');
  const fm = (t, k) => t.match(new RegExp(`^${k}: (.*)$`, 'm'))?.[1] ?? '';
  const roadmap = readdirSync(join(ROOT, 'docs/roadmap')).filter((f) => /^m\d+\.md$/.test(f)).map((f) => [f, readFileSync(join(ROOT, 'docs/roadmap', f), 'utf8')]);
  const heads = (t) => t.match(/^## ([UB]\d+)\b/gm)?.map((h) => h.slice(3)) ?? [];
  const built = new Set(roadmap.flatMap(([, t]) => [...t.split('\n').filter((l) => /^Built on /.test(l)).flatMap((l) => l.match(/\b[UB]\d+\b/g) ?? []), ...(/^(Closed|Done) /m.test(t) ? heads(t) : [])]));
  const planned = new Set(roadmap.flatMap(([, t]) => heads(t)));
  const docs = [...readdirSync(join(ROOT, 'docs/design')).filter((f) => f.endsWith('.md') && f !== 'index.md').map((f) => [`design/${f}`, readFileSync(join(ROOT, 'docs/design', f), 'utf8'), null]), ...roadmap.map(([f, t]) => [`roadmap/${f}`, t, heads(t)])];
  const wrong = docs.flatMap(([f, t, own]) => {
    const pending = (own ?? [...new Set(t.match(/\b[UB]\d+\b/g) ?? [])].filter((id) => planned.has(id))).filter((id) => !built.has(id));
    const want = pending.length ? 'draft' : 'stable';
    return (fm(t, 'status') || 'stable') === want && fm(t, 'description').startsWith('Draft') === (want === 'draft') ? [] : [`${f} should be ${want}`];
  });
  assert.deepEqual(wrong, []);
});

test('B158/AC-1 on the base (check --ci) a stale index or a broken link is an error, unless the profile sets its level', async () => {
  const { makeRepo, run } = await import('./state-repo.mjs');
  const docs = { 'docs/notes/a.md': '---\ntype: Note\ntitle: A\ndescription: A.\ngenerated: { by: x/1, at: 2026-10-27T00:00:00Z }\n---\n\nSee [b](b.md).\n' };
  const levels = (profile, args) => run(makeRepo(docs, profile), ['check', ...args]).out.split('\n').filter((l) => /HOUSE-(LINK|INDEX-STALE)/.test(l)).map((l) => `${l.match(/HOUSE-[A-Z-]+/)[0]} ${l.match(/\((\w+)\)$/)[1]}`).sort();
  assert.deepEqual(levels({}, []), ['HOUSE-INDEX-STALE warning', 'HOUSE-INDEX-STALE warning', 'HOUSE-LINK warning']);
  assert.deepEqual(levels({}, ['--ci']), ['HOUSE-INDEX-STALE error', 'HOUSE-INDEX-STALE error', 'HOUSE-LINK error']);
  assert.deepEqual(levels({ docs: { rules: { 'HOUSE-LINK': 'warning' } } }, ['--ci']), ['HOUSE-INDEX-STALE error', 'HOUSE-INDEX-STALE error', 'HOUSE-LINK warning'], "the profile's level wins");
});

test('B254/AC-1 B254/AC-2 the vocabulary defines every concept the plugin uses, once, and sends each other sense of a word to its own', async () => {
  const { config } = await import('../plugin/cli/lib/index.mjs');
  const V = config.vocabulary, words = V.words.map((w) => w.word);
  const concepts = ['module', 'runtime', 'pipeline', 'foundation', 'adapter', 'delivery', 'architecture model', 'stack pack', 'naming registry', 'profile',
    'aggregate', 'domain model', 'data node', 'API contract', 'integration event', 'domain event', 'command', 'query', 'route', 'handler',
    'test level', 'acceptance criterion', 'proof-revert', 'mutation', 'scope', "owner's request", 'requirement', 'persona', 'fact', 'decision', 'pathway', 'walking skeleton', 'method version', 'release',
    'docs bundle', 'merge gate', 'review', 'verdict', 'focus', 'builder', 'reviewer', 'researcher', 'worktree', 'trailer', 'base', 'stamp', 'board', 'retro', 'AI model'];
  assert.deepEqual(concepts.filter((c) => !words.includes(c)), [], 'every concept has its word');
  assert.deepEqual(words.filter((w, k) => words.indexOf(w) !== k), [], 'each word once');
  for (const w of V.words) assert.ok(w.meaning && w.scale && w.declared, w.word);
  assert.deepEqual(V.retired.filter((r) => r.word === 'model').map((r) => r.use).sort(), ['AI model', 'domain model'], 'model alone is the architecture model');
});

// M30 B255: the words a reader could misread keep one sense in every tracked text (docs/design/canonical-model.md).
test('B255/AC-1 the docs, what ships and the CLI\'s messages and fixes use each misreadable word only in an expression naming one sense', async () => {
  const { bareUses, covered, cliTexts } = await import('./senses.mjs');
  const found = [...covered().flatMap((f) => bareUses(readFileSync(join(ROOT, f), 'utf8')).map((u) => `${f}:${u.line} ${u.found}`)), ...cliTexts().flatMap(([where, t]) => bareUses(t).map((u) => `${where} ${u.found}`))];
  assert.deepEqual(found, [], `${found.length} bare uses; node tests/senses.mjs lists them`);
});
