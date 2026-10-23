import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, commit, git, intentDoc, makeRepo, read, review, run, tempDir, unitDoc, write } from './state-repo.mjs';
import { routeModel } from '../plugin/cli/lib/card.mjs';

const U1 = 'docs/units/U-1-pricing.md';
const PROFILE = {
  lanes: { quick: ['docs/**'], full: ['migrations/**'] },
  modules: [{ id: 'api', paths: ['src/**'], check: 'make test' }],
};
const doc = (opts = {}) => unitDoc({
  scope: ['src/pricing/**'],
  modules: ['api'],
  acs: ['- AC-1 (unit): rounds half-even.', '- AC-2 (integration): GET /prices returns EUR.'],
  extra: '\n# Interfaces\n\nSee [the API spec](../architecture/api.md).\n\n# Out of scope\n\n- Currency conversion.\n\n# Stories\n\nAs a buyer I see local prices.\n',
  ...opts,
});
const repo = (opts) => makeRepo({ 'docs/intents/I-1-pricing.md': intentDoc('I-1'), [U1]: doc(opts) }, PROFILE);
const hashOf = (out) => out.match(/^Card: (\w+)$/m)[1];

test('U4/AC-4 card renders from the base commit with the unit fields', () => {
  const dir = repo();
  approve(dir, 'I-1', 'U-1');
  write(dir, { [U1]: read(dir, U1).replace('rounds half-even', 'rounds up') }); // uncommitted edit
  const r = run(dir, ['card', 'U-1']);
  assert.equal(r.code, 0, r.err + r.out);
  const base = git(dir, 'rev-parse', 'main');
  assert.match(r.out, /^# U-1 Unit$/m);
  assert.match(r.out, /^Goal: Unit goal\.$/m);
  assert.match(r.out, /^Lane: standard /m);
  assert.match(r.out, new RegExp(`^Base: ${base}$`, 'm'));
  assert.match(r.out, /^- AC-1 \(unit\): rounds half-even\.$/m, 'the base content, not the worktree edit');
  assert.match(r.out, /^- src\/pricing\/\*\*$/m);
  assert.match(r.out, /^- docs\/architecture\/api\.md$/m, 'interface links become repo paths');
  assert.match(r.out, /^- api: make test$/m);
  assert.match(r.out, /^- Currency conversion\.$/m);
  assert.doesNotMatch(r.out, /As a buyer/);
  assert.ok(r.out.length <= 6000);
  const record = JSON.parse(read(dir, '.git/aidlc/cards/U-1.json'));
  assert.deepEqual(record, { unit: 'U-1', hash: hashOf(r.out), base, lane: 'standard', model: 'sonnet', scope: ['src/pricing/**'] });
});

test('U4/AC-4 card refuses an unapproved or stale unit, and one over 6,000 chars', () => {
  const dir = repo();
  let r = run(dir, ['card', 'U-1']);
  assert.equal(r.code, 2);
  assert.match(r.out, /U-1 is draft/);

  run(dir, ['approve', 'U-1']); // approved in the worktree only, not on the base
  assert.equal(run(dir, ['card', 'U-1']).code, 2);
  commit(dir, 'approve');
  assert.equal(run(dir, ['card', 'U-1']).code, 0);

  commit(dir, 'edit after approval', { [U1]: read(dir, U1).replace('rounds half-even', 'rounds up') });
  r = run(dir, ['card', 'U-1']);
  assert.equal(r.code, 2);
  assert.match(r.out, /U-1 is stale/);

  const big = repo({ acs: Array.from({ length: 80 }, (_, k) => `- AC-${k + 1} (unit): ${'x'.repeat(80)}.`) });
  approve(big, 'U-1');
  r = run(big, ['card', 'U-1']);
  assert.equal(r.code, 1);
  assert.match(r.out, /over 6000/);
});

test('U4/AC-4 the card hash changes when the unit doc changes, even outside the rendered parts', () => {
  const dir = repo();
  approve(dir, 'U-1');
  const h1 = hashOf(run(dir, ['card', 'U-1']).out);
  assert.equal(hashOf(run(dir, ['card', 'U-1']).out), h1, 'stable for the same doc');
  commit(dir, 'stories', { [U1]: read(dir, U1).replace('local prices', 'local prices fast') });
  approve(dir, 'U-1');
  assert.notEqual(hashOf(run(dir, ['card', 'U-1']).out), h1);
});

test('U4/AC-4 a project template overrides the card; the quick lane uses the short card', () => {
  const dir = repo();
  approve(dir, 'U-1');
  write(dir, { '.aidlc/templates/card.md': 'CARD {{id}} {{model}} {{hash}}\n' });
  assert.match(run(dir, ['card', 'U-1']).out, /^CARD U-1 sonnet \w{16}\n$/);

  const quick = makeRepo({ 'docs/units/U-1-typo.md': unitDoc({ intent: null, scope: ['docs/guide/**'], acs: ['- AC-1 (unit): `CLAUDE.md` is one line.'], extra: '\n# Out of scope\n\n- Other files.\n' }) }, PROFILE);
  const r = run(quick, ['card', 'U-1']);
  assert.equal(r.code, 0, 'a quick-lane fix unit needs no approval');
  assert.match(r.out, /^Lane: quick /m);
  assert.doesNotMatch(r.out, /Acceptance criteria|Interfaces/);
  assert.match(r.out, /^## Done when\n.*\n- AC-1 \(unit\): `CLAUDE\.md` is one line\.$/m, 'the quick card keeps the ACs as done-when');
  assert.match(r.out, /^- Other files\.$/m);
});

test('U4/AC-4 bundle-root interface links render as repo paths', () => {
  const dir = repo({ extra: '\n# Interfaces\n\n- [I-1](/intents/I-1-pricing.md)\n' });
  approve(dir, 'I-1', 'U-1');
  assert.match(run(dir, ['card', 'U-1']).out, /^- docs\/intents\/I-1-pricing\.md$/m);
});

test('U4/AC-5 the model follows the routing table, escalation signals and fix rounds', () => {
  const unit = (o = {}) => ({ scope: ['src/**'], modules: ['api'], acs: [1, 2], ...o });
  assert.equal(routeModel(unit(), 'quick').model, 'sonnet');
  assert.equal(routeModel(unit(), 'standard').model, 'sonnet');
  assert.equal(routeModel(unit(), 'full').model, 'opus');
  assert.match(routeModel(unit({ modules: ['api', 'web'] }), 'standard').reason, /escalated: 2 modules/);
  assert.equal(routeModel(unit({ acs: [1, 2, 3, 4, 5, 6] }), 'standard').model, 'opus');
  const complex = { models: { complex: ['src/sync/**'] } };
  assert.match(routeModel(unit({ scope: ['src/**'] }), 'standard', complex).reason, /src\/sync\/\*\* is complex/);
  assert.equal(routeModel(unit(), 'standard', { models: { standard: 'haiku' } }).model, 'haiku');

  const fix = (confidence) => ({ rounds: [{ verdict: 'fix', findings: [{ confidence }] }] });
  assert.equal(routeModel(unit(), 'standard', {}, fix('PLAUSIBLE')).model, 'sonnet', 'same as round 1');
  assert.deepEqual(routeModel(unit(), 'standard', {}, fix('CONFIRMED')), { model: 'opus', reason: 'fix round after a CONFIRMED finding' });
  assert.equal(routeModel(unit(), 'full', {}, fix('CONFIRMED')).model, 'opus');
});

test('U4/AC-5 the card of a fix round carries the escalated model', () => {
  const dir = repo();
  approve(dir, 'I-1', 'U-1');
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'work', { 'src/pricing/a.txt': 'a\n' });
  git(dir, 'switch', '-q', 'main');
  review(dir, 'U-1', 'fix', [{ path: 'src/pricing/a.txt', line: 1, claim: 'x', scenario: 'y', confidence: 'CONFIRMED' }]);
  assert.match(run(dir, ['card', 'U-1']).out, /^Model: opus \(fix round after a CONFIRMED finding\)$/m);
});

test('U4/AC-7 start renames the worktree branch to unit/U-<n> and refuses a different base', () => {
  const dir = repo();
  approve(dir, 'I-1', 'U-1');
  assert.equal(run(dir, ['start', 'U-1']).code, 64, 'not in the main checkout');

  const wt1 = join(tempDir('wt-'), 'w');
  git(dir, 'worktree', 'add', '-q', '-b', 'worktree-agent-1', wt1, 'main');
  assert.equal(run(wt1, ['start', 'U-1']).code, 1, 'no card yet');
  run(dir, ['card', 'U-1']);
  const r = run(wt1, ['start', 'U-1']);
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(git(wt1, 'rev-parse', '--abbrev-ref', 'HEAD'), 'unit/U-1');
  assert.equal(run(wt1, ['start', 'U-1']).code, 0, 'idempotent');

  commit(dir, 'base moves on', { 'README.md': 'x\n' });
  const wt2 = join(tempDir('wt-'), 'w');
  git(dir, 'worktree', 'add', '-q', '-b', 'worktree-agent-2', wt2, 'main');
  const moved = run(wt2, ['start', 'U-1']);
  assert.equal(moved.code, 1);
  assert.match(moved.out, /restart the builder from a fresh card/);
  assert.equal(git(wt2, 'rev-parse', '--abbrev-ref', 'HEAD'), 'worktree-agent-2');

  run(dir, ['card', 'U-1']);
  write(wt1, { 'src/pricing/wip.txt': 'not committed\n' });
  const taken = run(wt2, ['start', 'U-1']);
  assert.equal(taken.code, 1);
  assert.match(taken.out, /unit\/U-1 is checked out in /);
});

test('U8/AC-7 start takes over the branch from a clean earlier worktree, even with a fresh heartbeat, and refuses a dirty one', () => {
  const dir = repo();
  approve(dir, 'I-1', 'U-1');
  run(dir, ['card', 'U-1']);
  const worktree = (n) => {
    const wt = join(tempDir('wt-'), 'w');
    git(dir, 'worktree', 'add', '-q', '-b', `worktree-agent-${n}`, wt, 'main');
    return wt;
  };
  const wt1 = worktree(1);
  assert.equal(run(wt1, ['start', 'U-1']).code, 0);
  commit(wt1, 'wip', { 'src/pricing/a.txt': 'a\n' });

  const wt2 = worktree(2);
  write(wt1, { 'src/pricing/b.txt': 'dirty\n' });
  assert.equal(run(wt2, ['start', 'U-1']).code, 1, 'dirty');
  rmSync(join(wt1, 'src/pricing/b.txt'));
  const beat = join(dir, '.git/aidlc/heartbeats/U-1');
  mkdirSync(join(beat, '..'), { recursive: true });
  writeFileSync(beat, ''); // the new builder's own launch mark
  const r = run(wt2, ['start', 'U-1']);
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(git(wt2, 'rev-parse', '--abbrev-ref', 'HEAD'), 'unit/U-1');
  assert.equal(read(wt2, 'src/pricing/a.txt'), 'a\n');
  assert.ok(!existsSync(wt1));
});

test('U4/AC-4 the card hash ignores a base that moved for other units', () => {
  const dir = repo();
  approve(dir, 'I-1', 'U-1');
  const before = hashOf(run(dir, ['card', 'U-1']).out);
  commit(dir, 'another unit merged', { 'README.md': 'x\n' });
  const after = run(dir, ['card', 'U-1']).out;
  assert.notEqual(after.match(/^Base: (\w+)$/m)[1], git(dir, 'rev-parse', 'HEAD~1'));
  assert.equal(hashOf(after), before);
});

test('U16/AC-1 start merges the card base into an existing unit branch; a conflict is named and left to resolve', () => {
  const dir = repo();
  approve(dir, 'I-1', 'U-1');
  run(dir, ['card', 'U-1']);
  const worktree = (n) => {
    const wt = join(tempDir('wt-'), 'w');
    git(dir, 'worktree', 'add', '-q', '-b', `worktree-agent-${n}`, wt, 'main');
    return wt;
  };
  const wt1 = worktree(1);
  assert.equal(run(wt1, ['start', 'U-1']).code, 0);
  commit(wt1, 'wip', { 'src/pricing/a.txt': 'a\n', 'README.md': 'unit\n' });
  git(dir, 'worktree', 'remove', wt1);

  commit(dir, 'another unit merged', { 'src/shared.txt': 'merged since\n' });
  run(dir, ['card', 'U-1']);
  const wt2 = worktree(2);
  const r = run(wt2, ['start', 'U-1']);
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(r.out, /^on unit\/U-1, with the card's base [0-9a-f]{40} merged in$/m);
  assert.equal(read(wt2, 'src/shared.txt'), 'merged since\n', 'the restarted builder sees the work merged since');
  assert.equal(read(wt2, 'src/pricing/a.txt'), 'a\n', 'and keeps its own');
  assert.match(run(wt2, ['start', 'U-1']).out, /^on unit\/U-1 at /, 'nothing to merge the second time');
  git(dir, 'worktree', 'remove', wt2);

  commit(dir, 'the base edits the same line', { 'README.md': 'base\n' });
  run(dir, ['card', 'U-1']);
  const wt3 = worktree(3);
  const c = run(wt3, ['start', 'U-1']);
  assert.equal(c.code, 1);
  assert.match(c.out, /conflicts in README\.md → resolve them inside the scope, commit, and run start again/);
});

test('U22/AC-2 the card lists the checks of a module the profile keys by name', () => {
  const dir = makeRepo({ 'docs/intents/I-1-x.md': intentDoc('I-1'), 'docs/units/U-1-a.md': unitDoc({ scope: ['sdk/**'], modules: ['sdk-go'] }) },
    { modules: [{ name: 'sdk-go', paths: ['sdk/**'], check: 'make sdk-test' }] });
  approve(dir, 'I-1', 'U-1');
  const r = run(dir, ['card', 'U-1']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /## Checks\n- sdk-go: make sdk-test\n/);
});

test('U27/AC-1 U27/AC-3 the card carries the project rules at the base, but a focus rule, and counts them toward its cap', () => {
  const plain = repo();
  approve(plain, 'I-1', 'U-1');
  const before = run(plain, ['card', 'U-1']).out;
  assert.doesNotMatch(before, /Project rule/, 'no rules folder: the card as before');

  const dir = makeRepo({ 'docs/intents/I-1-pricing.md': intentDoc('I-1'), [U1]: doc(),
    '.aidlc/rules/style.md': '# Style\n\nName errors ErrX.\n', '.aidlc/rules/payments.md': 'Check idempotency keys.\n', '.aidlc/rules/notes.txt': 'not a rule\n' },
  { ...PROFILE, focus: { payments: ['src/pay/**'] } });
  approve(dir, 'I-1', 'U-1');
  write(dir, { '.aidlc/rules/style.md': '# Style\n\nChanged after the base.\n' });
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /^## Project rule: \.aidlc\/rules\/style\.md\n# Style\n\nName errors ErrX\.\n/m, 'from the base commit');
  assert.ok(card.indexOf('Project rule') < card.indexOf('## Acceptance criteria'), 'before the ACs');
  assert.doesNotMatch(card, /idempotency|notes\.txt/, 'a focus rule stays the reviewer\'s; only .md files');
  assert.equal(before.replace(/^(Base|Card): .*$/gm, ''), run(plain, ['card', 'U-1']).out.replace(/^(Base|Card): .*$/gm, ''));

  commit(dir, 'a long rule', { '.aidlc/rules/style.md': '# Style\n\n' + 'Keep it short. '.repeat(400) + '\n' });
  approve(dir, 'U-1');
  const long = run(dir, ['card', 'U-1']);
  assert.notEqual(long.code, 0);
  assert.match(long.out, /^card for U-1 is \d+ chars, over 6000, \d{4} of them project rules: shorten the unit doc or the rules$/m);
});

test('U29/AC-1 U29/AC-2 U29/AC-3 the card names requirements as their files do, keeps plain interface lines and names the proof levels', () => {
  const req = '---\ntype: Requirement\ntitle: Prices\ndescription: Prices are local.\n---\n\n# Statement\nPrices are local.\n';
  const dir = makeRepo({ 'docs/intents/I-1-pricing.md': intentDoc('I-1'), 'docs/requirements/R-057.md': req,
    [U1]: doc({ extra: '\n# Interfaces\n\n- internal/buildinfo: Get() Info, Info.String()\n- See [the API spec](../architecture/api.md).\n' }).replace('---\n\n#', 'requirements: [R-057]\n---\n\n#') },
  { ...PROFILE, levels: { unit: { paths: ['src/**/*.test.mjs', 'tests/**'], run: 'node --test' }, e2e: { paths: ['e2e/**'] } } });
  approve(dir, 'I-1', 'R-057', 'U-1');
  const card = run(dir, ['card', 'U-1']);
  assert.equal(card.code, 0, card.out + card.err);
  assert.match(card.out, /^- R-057 docs\/requirements\/R-057\.md$/m);
  assert.match(card.out, /^- internal\/buildinfo: Get\(\) Info, Info\.String\(\)$/m, 'a plain interface line is kept');
  assert.match(card.out, /^- docs\/architecture\/api\.md$/m);
  assert.match(card.out, /^The merge gate reverts your changes outside the test paths of unit and reruns those levels: each one holding a tagged test must then fail\.$/m);
  assert.doesNotMatch(card.out, /outside src\//);
});
