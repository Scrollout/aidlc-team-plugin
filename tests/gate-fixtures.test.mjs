import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { approve, commit, git, read, unitDoc, write } from './state-repo.mjs';
import { CODE, codes, FAIL, FAIL_MERGED, merge, PROFILE, setup, TEST, U1 } from './gate-repo.mjs';

// AC-1: each gate condition fails on its own fixture with its code and a fix.
const BROKEN = {
  'GATE-APPROVAL': () => setup({ beforeReview: (d) => write(d, { [U1]: read(d, U1).replace('adds two', 'adds three') }) }),
  'GATE-DEPS': () => setup({ unit: { depends: ['U-2'] }, beforeReview: (d) => { commit(d, 'u2', { 'docs/units/U-2-x.md': unitDoc({ scope: ['lib/**'] }) }); approve(d, 'U-2'); } }),
  'SCOPE-OUT': () => setup({ files: { ...CODE, ...TEST, 'lib/extra.mjs': '1;\n' } }),
  'GATE-LANE': () => setup({ beforeReview: (d) => write(d, { '.aidlc/profile.json': { ...PROFILE, lanes: { quick: [], full: ['src/add.mjs'] } } }) }),
  'GATE-AC': () => setup({ files: { ...CODE, 'tests/add.test.mjs': "import { test } from 'node:test';\ntest('adds', () => {});\n" } }),
  'GATE-LEVEL': () => setup({ files: { ...CODE, 'src/add.check.mjs': '// U-1/AC-1\n' } }),
  'GATE-CHECK': () => setup({ profile: { ...PROFILE, modules: [{ id: 'core', paths: ['src/**'], check: FAIL }] } }),
  'GATE-RUN': () => setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: FAIL_MERGED } } } }),
  'GATE-SKIP': () => setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: 'node -e "console.log(\'# SKIP U-1/AC-1 needs a database\')"', skip: '^# SKIP' } } } }),
  'GATE-REVIEW': () => setup({ verdict: 'fix' }),
  'GATE-CARD': () => {
    const d = setup();
    write(d, { '.git/aidlc/cards/U-1.json': { ...JSON.parse(read(d, '.git/aidlc/cards/U-1.json')), hash: 'newercardhash000' } });
    return d;
  },
  'GATE-SPECIALIST': () => setup({ unit: { scope: ['src/**', 'tests/**', 'auth/**'] }, files: { ...CODE, ...TEST, 'auth/login.mjs': 'export const ok = 1;\n' } }),
  'GATE-OKF': () => setup({ unit: { scope: ['src/**', 'tests/**', 'docs/notes/**'] }, files: { ...CODE, ...TEST, 'docs/notes/bad.md': '# no frontmatter\n' } }),
  'GATE-SECURITY': () => setup({ profile: { ...PROFILE, security: { content: [], check: [FAIL] } } }),
  'ARCH-BOUNDARY': () => setup({ profile: { ...PROFILE, architecture: { graph: 'node -e "console.log(\'src/add.mjs -> lib/db.mjs\')"', boundaries: [{ from: 'src/**', deny: ['lib/**'], reason: 'src never uses lib' }] } } }),
  'ARCH-DATA': () => setup({ profile: { ...PROFILE, modules: [{ id: 'core', paths: ['src/**'] }, { id: 'store', paths: ['lib/**'], data: ['data/items'] }],
    architecture: { graph: 'node -e "console.log(\'src -> data/items\')"', data: { prefix: 'data/' } } } }),
  'ARCH-API': () => setup({ profile: { ...PROFILE, modules: [{ id: 'core', paths: ['src/**'] }, { id: 'store', paths: ['lib/**'], api: ['lib/api/**'] }],
    architecture: { graph: 'node -e "console.log(\'src -> lib/db\')"' } } }),
  'ARCH-CYCLE': () => setup({ profile: { ...PROFILE, modules: [{ id: 'core', paths: ['src/**'] }, { id: 'store', paths: ['lib/**'] }],
    architecture: { graph: 'node -e "console.log(\'src -> lib\\nlib -> src\')"', acyclic: true } } }),
  'GATE-NAME': () => setup({ profile: { ...PROFILE, names: [{ id: 'export', files: ['src/**'], find: 'export const (\\w+)', pattern: '[a-z]+Total', why: 'docs/decisions/names.md' }] } }),
  'GATE-DEPENDENCY': () => setup({ profile: { ...PROFILE, deps: { manifests: ['package.json'], check: [FAIL] } } }),
  'GATE-IDENTITY': () => setup({ files: { ...CODE, ...TEST, 'src/db.mjs': "export const url = 'postgres://app:s3cretpw@db:5432/app';\n" } }),
  'ARCH-CHECK': () => setup({ profile: { ...PROFILE, architecture: { checks: [FAIL] } } }),
  'GATE-SHARED': () => setup({ unit: { scope: ['src/**', 'tests/**', 'docs/**'] }, files: { ...CODE, ...TEST, 'docs/log.md': 'edited by a builder\n' } }),
  'GATE-CONFLICT': () => setup({ unit: { scope: ['src/**', 'tests/**', 'README.md'], twoWay: 'a readme line' }, files: { ...CODE, ...TEST, 'README.md': 'unit\n' }, beforeReview: (d) => commit(d, 'base moves', { 'README.md': 'base\n' }) }),
};

for (const [code, make] of Object.entries(BROKEN)) {
  test(`U6/AC-1 ${code} fails the gate on its fixture and names its fix`, () => {
    const dir = make();
    const head = git(dir, 'rev-parse', 'HEAD');
    const r = merge(dir);
    assert.equal(r.code, 1, r.out + r.err);
    assert.ok(codes(r).includes(code), `${code} missing in:\n${r.out}`);
    assert.match(r.out, new RegExp(`${code} .+ → \\S`));
    assert.equal(git(dir, 'rev-parse', 'HEAD'), head, 'a failed gate leaves the base untouched');
    assert.equal(git(dir, 'worktree', 'list').split('\n').length, 1, 'no trial worktree left behind');
  });
}

test('U95/AC-1 GATE-NAME names the file, line, name, rule and why; a name that matches, or a file no rule looks at, passes', () => {
  const rule = { id: 'export', files: ['src/**'], find: 'export const (\\w+)', pattern: '[a-z]+', why: 'docs/decisions/names.md' };
  const r = merge(setup({ profile: { ...PROFILE, names: [{ ...rule, pattern: '[a-z]+Total' }] } }));
  assert.match(r.out, /GATE-NAME src\/add\.mjs:1 names add, which does not match the export rule \[a-z\]\+Total \(docs\/decisions\/names\.md\)/);
  assert.ok(!codes(merge(setup({ profile: { ...PROFILE, names: [rule] } }))).includes('GATE-NAME'), 'add matches');
  assert.ok(!codes(merge(setup({ profile: { ...PROFILE, names: [{ ...rule, files: ['lib/**'], pattern: 'x' }] } }))).includes('GATE-NAME'), 'no rule looks at src');
});

test('U96/AC-1 a rule without find checks the path of each file the unit adds', () => {
  const rule = { id: 'source', files: ['src/**'], pattern: 'src/[a-z]+\\.mjs', why: 'docs/decisions/names.md' };
  const r = merge(setup({ profile: { ...PROFILE, names: [rule] }, files: { ...CODE, ...TEST, 'src/Bad_Name.mjs': 'export const x = 1;\n' } }));
  assert.match(r.out, /GATE-NAME src\/Bad_Name\.mjs does not match the source rule src\/\[a-z\]\+\\\.mjs \(docs\/decisions\/names\.md\)/);
  assert.doesNotMatch(r.out, /GATE-NAME src\/add\.mjs/, 'add.mjs matches');
});

test('U108/AC-1 GATE-IDENTITY skips the test paths: a throwaway password belongs in a fixture', () => {
  const r = merge(setup({ files: { ...CODE, ...TEST, 'tests/db.fixture.mjs': "export const url = 'postgres://app:s3cretpw@db:5432/app';\n" } }));
  assert.ok(!codes(r).includes('GATE-IDENTITY'), r.out);
});

test('U140/AC-1 the profile\'s checks run on every merge, whatever modules the unit touches', () => {
  const r = merge(setup({ profile: { ...PROFILE, checks: [FAIL] } }));
  assert.equal(r.code, 1);
  assert.match(r.out + r.err, /GATE-CHECK/);
});

test('U147/AC-1 a refused merge keeps the last lines of each failed command and names the file', () => {
  const dir = setup({ profile: { ...PROFILE, checks: ['node -e "console.log(\'lint: 3 issues\'); process.exit(2)"'] } });
  const r = merge(dir);
  assert.match(r.out + r.err, /GATE-CHECK/);
  assert.match(r.out, /^the last lines of each command that failed: \.git\/aidlc\/gates\/U-1\.log$/m);
  assert.match(read(dir, '.git/aidlc/gates/U-1.log'), /\(exit 2\)\nlint: 3 issues/);
});

test('U144/AC-1 merge marks the base as merging while its gate runs, and clears the mark after', () => {
  const dir = setup({ profile: PROFILE });
  const mark = join(dir, '.git/aidlc/merging');
  write(dir, { '.aidlc/profile.json': JSON.stringify({ ...PROFILE, checks: [`node -e "process.exit(require('fs').existsSync(process.argv[1]) ? 0 : 1)" "${mark}"`] }) });
  commit(dir, 'a check that sees the mark');
  const r = merge(dir);
  assert.doesNotMatch(r.out + r.err, /GATE-CHECK/, 'the mark exists while the gate runs');
  assert.equal(existsSync(mark), false, 'cleared after the gate');
});

test('B162/AC-2 with a naming registry the gate refuses a new path with a banned segment, as the generated banned rule', () => {
  const naming = { tokens: { system: 'shop' }, domains: { orders: {} } };
  const r = merge(setup({ profile: { ...PROFILE, naming }, files: { ...CODE, ...TEST, 'src/utils/x.mjs': 'export const x = 1;\n' } }));
  assert.match(r.out, /GATE-NAME src\/utils\/x\.mjs does not match the banned rule/);
  assert.doesNotMatch(r.out, /GATE-NAME src\/add\.mjs/, 'a plain name passes');
  assert.ok(!codes(merge(setup({ profile: PROFILE, files: { ...CODE, ...TEST, 'src/utils/x.mjs': 'export const x = 1;\n' } }))).includes('GATE-NAME'), 'no registry, no generated rule');
  // A new file in a folder the base already holds adds no new banned segment: the folder is known debt, judged where it moves.
  const debt = merge(setup({ profile: { ...PROFILE, naming }, files: { ...CODE, ...TEST, 'src/utils/x.mjs': 'export const x = 1;\n' }, beforeReview: (d) => commit(d, 'the folder exists', { 'src/utils/old.mjs': 'export const o = 1;\n' }) }));
  assert.doesNotMatch(debt.out, /GATE-NAME src\/utils\/x\.mjs/);
  const named = merge(setup({ profile: { ...PROFILE, naming }, files: { ...CODE, ...TEST, 'src/utils/helpers.mjs': 'export const h = 1;\n' }, beforeReview: (d) => commit(d, 'the folder exists', { 'src/utils/old.mjs': 'export const o = 1;\n' }) }));
  assert.match(named.out, /GATE-NAME src\/utils\/helpers\.mjs does not match the banned rule/, 'a new file name with a banned word still fails');
});

test('B163/AC-2 a synonym a domain glossary says to avoid, on an added line outside the domain docs, is TERM-SYNONYM', () => {
  const orders = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Glossary\n- **order** (not: purchase, basket): what a buyer asks for\n';
  const r = merge(setup({ files: { ...CODE, ...TEST, 'src/order.mjs': 'export const purchase = 1;\n' }, beforeReview: (d) => commit(d, 'orders domain', { 'docs/domains/orders.md': orders }) }));
  assert.match(r.out, /TERM-SYNONYM src\/order\.mjs:1 says purchase, a synonym of order in the orders glossary/);
  assert.doesNotMatch(r.out, /TERM-SYNONYM src\/add\.mjs/, 'a line without one passes');
});
