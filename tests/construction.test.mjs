// M19: construction by proof (docs/design/construction.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintPlan } from '../plugin/cli/lib/grid.mjs';
import { approve, commit, git, makeRepo, read, review, run, tempDir, unitDoc } from './state-repo.mjs';

const OK = 'node -e "process.exit(0)"';
// Passes with B-1's code in, fails at run time with it reverted.
const RUNS = 'node -e "process.exit(require(\'fs\').existsSync(\'src/quotas/add.mjs\') ? 0 : 1)"';
const V2 = { system: { core: ['src/**'] }, levels: { unit: { paths: ['tests/**'], run: RUNS } }, modules: [
  { id: 'quotas', kind: 'domain', paths: ['src/quotas/**'] }, { id: 'deployments', kind: 'domain', paths: ['src/deployments/**'] },
  { id: 'database', kind: 'foundation', paths: ['src/database/**'] }, { id: 'release', kind: 'delivery', paths: ['deploy/**'] },
] };
const intent = (lines) => `---\ntype: Intent\ntitle: Backbone\ndescription: The backbone.\npathway: feature\n---\n\n# Goal\nx\n\n# Increments\n${lines.map((l, k) => `- I-1.${k + 1} Step ${k + 1}: ${l}`).join('\n')}\n`;
const bolt = (n, opts) => [`docs/bolts/B-${n}-b${n}.md`, unitDoc({ title: `B${n}`, ...opts }).replace('type: Unit', 'type: Bolt')];
const found = (dir, profile, re) => lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => re.test(f.code)).map((f) => `${f.code} ${f.message}`);

test('B182/AC-1 outside increment 1 a bolt binds one domain, or one horizontal module a domain bolt of its increment needs', () => {
  const docs = Object.fromEntries([
    ['docs/intents/I-1-backbone.md', intent(['B-1', 'B-2, B-3, B-4, B-5, B-6, B-7'])],
    bolt(1, { modules: ['quotas', 'deployments'], scope: ['src/**'] }), // increment 1 may span
    bolt(2, { modules: ['quotas', 'deployments'], scope: ['src/quotas/**'] }),
    bolt(3, { modules: ['database'], scope: ['src/database/a/**'] }),
    bolt(4, { modules: ['database'], scope: ['src/database/b/**'], extra: '' }),
    bolt(5, { modules: ['quotas'], scope: ['src/quotas/x/**'] }),
    bolt(6, { modules: ['quotas'], scope: ['src/quotas/y/**', 'src/deployments/y/**'] }),
    bolt(7, { modules: ['quotas', 'database'], scope: ['src/quotas/z/**'] }),
  ]);
  docs['docs/bolts/B-4-b4.md'] = docs['docs/bolts/B-4-b4.md'].replace('scope:', 'neededBy: B-5\nscope:');
  assert.deepEqual(found(makeRepo(docs, V2), V2, /^BOLT-/), [
    'BOLT-SPAN B-2 binds the domains quotas, deployments: outside increment 1 a bolt binds one domain',
    'BOLT-BIND B-3 binds the horizontal module database with no neededBy naming a bolt of I-1.2 that binds a domain',
    'BOLT-SPAN B-6 reaches the domain deployments through scope src/deployments/y/** without binding it',
    'BOLT-BIND B-7 binds quotas, database: bind one domain, or one horizontal module',
  ]);
  assert.deepEqual(found(makeRepo(docs, {}), {}, /^BOLT-/), [], 'a v1 project keeps its rules');
});

test('B183/AC-1 next starts bolts side by side only when their bindings share no module', () => {
  const docs = Object.fromEntries([['docs/intents/I-1-backbone.md', intent(['B-1, B-2, B-3'])],
    bolt(1, { modules: ['quotas'], scope: ['src/quotas/a/**'] }), bolt(2, { modules: ['quotas'], scope: ['src/quotas/b/**'] }), bolt(3, { modules: ['deployments'], scope: ['src/deployments/**'] })]);
  const dir = makeRepo(docs, V2);
  approve(dir, 'I-1', 'B-1', 'B-2', 'B-3');
  assert.match(run(dir, ['next']).out, /^build B-1, B-3 \(cards/);
});

test('B184/AC-1 a revert that fails to compile is PROOF-AC: a compile failure proves no AC at run time', () => {
  const unit = 'node -e "if (!require(\'fs\').existsSync(\'src/quotas/add.mjs\')) { console.log(\'FAIL x [build failed]\'); process.exit(1) }"';
  const profile = { ...V2, levels: { unit: { paths: ['tests/**'], run: unit, compileError: '\\[build failed\\]' } } };
  const dir = built(profile);
  assert.match(run(dir, ['merge', 'B-1']).out, /PROOF-AC level unit fails to compile with B-1's changes reverted/);
});

test('B185/AC-1 a security finding at any confidence holds the merge until the owner disposes of it', () => {
  const dir = built(V2, (d) => record(d, { verdict: 'pass', focus: 'security', findings: [{ path: 'src/quotas/add.mjs', line: 1, claim: 'a provider could take over', confidence: 'PLAUSIBLE' }] }));
  assert.match(run(dir, ['merge', 'B-1']).out, /REVIEW-SECURITY the security review of B-1 has open findings F-1/);
  assert.equal(run(dir, ['dispose', 'B-1', 'F-1', 'accepted', 'checked by hand', '--until', '2020-01-01']).code, 0);
  assert.match(run(dir, ['merge', 'B-1']).out, /REVIEW-SECURITY/, 'an acceptance past its until holds it again');
  assert.equal(run(dir, ['dispose', 'B-1', 'F-1', 'fixed', 'the check moved']).code, 0);
  const r = run(dir, ['merge', 'B-1']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(read(dir, 'docs/architecture/traceability-i-1.md'), /^\| R-1 \| B-1\/AC-1 \| tests\/add\.test\.mjs \| - \| - \|$/m, 'B187: the page is written at the merge');
});

test('B186/AC-1 with a deploy, increment 1 holds a top-level AC and the delivery module (INCR-SKELETON)', () => {
  const profile = { ...V2, levels: { ...V2.levels, e2e: { paths: ['e2e/**'], run: OK } }, deploy: { run: OK, platform: 'docs/platform.md' } };
  const docs = Object.fromEntries([['docs/intents/I-1-backbone.md', intent(['B-1'])], bolt(1, { modules: ['quotas'], scope: ['src/quotas/**'] })]);
  assert.deepEqual(found(makeRepo(docs, profile), profile, /^INCR-/), [
    "INCR-SKELETON I-1's increment 1 has no bolt with a e2e AC: the walking skeleton runs end to end",
    "INCR-SKELETON I-1's increment 1 has no bolt binding a delivery module: the walking skeleton runs on its target",
  ]);
  const fixed = { ...docs, ...Object.fromEntries([bolt(1, { modules: ['quotas', 'release'], scope: ['src/quotas/**', 'deploy/**'], acs: ['- AC-1 (e2e): it runs on dev.'] })]) };
  assert.deepEqual(found(makeRepo(fixed, profile), profile, /^INCR-/), []);
});

test('B186/AC-2 no bolt of a later increment merges before increment 1 is in a passing release (INCR-DONE)', () => {
  const profile = { ...V2, release: OK };
  const dir = built(profile);
  commit(dir, 'cut the skeleton first', { 'docs/intents/I-1-backbone.md': read(dir, 'docs/intents/I-1-backbone.md').replace('- I-1.1 Step 1: B-1', '- I-1.1 Step 1: B-9\n- I-1.2 Step 2: B-1') });
  assert.match(run(dir, ['merge', 'B-1']).out, /INCR-DONE B-1 is on increment I-1\.2 of I-1, whose increment 1 is not done/);
});

test('B187/AC-2 a v2 requirement is delivered only when each AC of each bolt citing it has a test in a release', () => {
  const dir = built(V2);
  assert.equal(run(dir, ['merge', 'B-1']).code, 0);
  assert.match(run(dir, ['status']).out, /^not yet delivered: R-1$/m, 'merged is not delivered');
  git(dir, 'tag', 'v1');
  assert.doesNotMatch(run(dir, ['status']).out, /not yet delivered/, 'a tag holding its tests delivers it');
});

test('B188/AC-1 a fix bolt has exactly one AC and touches no decision (FIX-SHAPE); aidlc fix writes one that passes', () => {
  const docs = Object.fromEntries([bolt(1, { intent: '', acs: ['- AC-1 (unit): a.', '- AC-2 (unit): b.'], scope: ['docs/decisions/**'] })]);
  const dir = makeRepo(docs, V2);
  assert.deepEqual(found(dir, V2, /^FIX-/), ['FIX-SHAPE fix bolt B-1 has 2 ACs: a fix bolt has exactly one, its regression test', 'FIX-SHAPE fix bolt B-1 reaches docs/decisions/** through scope docs/decisions/**: a fix bolt touches no decision']);
  assert.equal(run(dir, ['fix', 'Totals drift', '--scope', 'src/quotas/**', '--scope', 'tests/**']).code, 0);
  assert.deepEqual(found(dir, V2, /^FIX-/).filter((l) => /B-2/.test(l)), []);
});

test('B189/AC-1 escape hatches carry until: an expired one in a doc is HATCH-EXPIRED, a delegation lapses, status lists the live ones', () => {
  const docs = Object.fromEntries([bolt(1, { intent: '', scope: ['src/quotas/**'] })]);
  docs['docs/bolts/B-1-b1.md'] = docs['docs/bolts/B-1-b1.md'].replace('scope:', 'until: 2020-01-01\nscope:');
  const dir = makeRepo(docs, V2);
  assert.deepEqual(found(dir, V2, /^HATCH-/), ['HATCH-EXPIRED the fix bolt B-1 expired on 2020-01-01']);
  assert.equal(run(dir, ['delegate', 'quick', '--until', '2999-01-01']).code, 0);
  assert.match(run(dir, ['status']).out, /^escape hatches: B-1 fix bolt until 2020-01-01, quick delegation until 2999-01-01$/m);
  assert.equal(run(dir, ['delegate', 'quick', '--until', '2020-01-01']).code, 0);
  assert.match(run(dir, ['status']).out, /^escape hatches: B-1 fix bolt until 2020-01-01$/m, 'a lapsed delegation is gone');
  assert.match(run(dir, ['delegate', 'quick', '--until', 'soon']).err, /usage: delegate/);
});

test('B189/AC-2 the retro measures lead time, increments shipped, refusals by binding, owner dwell and hatches', () => {
  const dir = built(V2);
  run(dir, ['merge', 'B-1']);
  const out = run(dir, ['retro', 'I-1']).out;
  assert.match(out, /^measures:\n {2}lead time, approval to passing smoke: -\n {2}increments shipped: 0 of 1\n {2}merge refusals by binding: -\n {2}owner dwell per approval: I-1 \d+h, B-1 \d+h, R-1 \d+h\n {2}escape hatches: -$/m);
});

test('B190/AC-1 the board derives a bolt binding: its domain, its horizontal kind, fix or span', async () => {
  const { bindingName } = await import('../plugin/cli/lib/construction.mjs');
  const b = (modules, intent = 'I-1') => bindingName({ modules, fm: { intent } }, V2);
  assert.deepEqual([b(['quotas']), b(['database']), b(['quotas', 'deployments']), b(['quotas'], null)], ['quotas', 'foundation', 'span', 'fix']);
});

// An approved, carded and built B-1 citing R-1, with a passing general review unless `before` records otherwise.
function built(profile, before) {
  const dir = makeRepo({
    'docs/intents/I-1-backbone.md': intent(['B-1']).replace('pathway: feature\n', 'pathway: feature\nrequirements: [R-1]\n'),
    'docs/requirements/R-1-limits.md': '---\ntype: Requirement\ntitle: Limits\ndescription: Limits.\n---\n\n# Acceptance criteria\n- AC-1 (unit): x.\n',
    ...Object.fromEntries([bolt(1, { modules: ['quotas'], scope: ['src/quotas/**', 'tests/**'], acs: ['- AC-1 (unit): adds.'], extra: '' })]),
  }, profile);
  writeFileSync(join(dir, 'docs/bolts/B-1-b1.md'), read(dir, 'docs/bolts/B-1-b1.md').replace('scope:', 'requirements: [R-1]\nscope:'));
  commit(dir, 'cite R-1');
  approve(dir, 'R-1', 'I-1', 'B-1');
  assert.equal(run(dir, ['card', 'B-1']).code, 0);
  git(dir, 'switch', '-q', '-c', 'bolt/B-1');
  commit(dir, 'build B-1', { 'src/quotas/add.mjs': 'export const add = (a, b) => a + b;\n', 'tests/add.test.mjs': '// B-1/AC-1 adds\n' });
  git(dir, 'switch', '-q', 'main');
  before?.(dir);
  review(dir, 'B-1', 'pass');
  return dir;
}

function record(dir, verdict) {
  const file = join(tempDir('verdict-'), 'verdict.json');
  writeFileSync(file, JSON.stringify(verdict));
  const r = run(dir, ['review', 'record', 'B-1', file]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, '.git/aidlc/reviews/B-1.json')));
}
