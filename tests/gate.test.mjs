import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approve, commit, git, intentDoc, makeRepo, read, review, run, unitDoc, write } from './state-repo.mjs';
import { boundaryFindings } from '../plugin/cli/lib/gate.mjs';

const OK = 'node -e "process.exit(0)"';
const FAIL = 'node -e "process.exit(1)"';
const U1 = 'docs/units/U-1-add.md';
const PROFILE = {
  levels: { unit: { paths: ['tests/**'], run: 'node --test' } },
  modules: [{ id: 'core', paths: ['src/**'], check: OK }],
  lanes: { quick: ['docs/**'], full: ['db/**'] },
  focus: { security: ['auth/**'] },
  security: { content: ['password'], check: [OK] },
};
const CODE = { 'src/add.mjs': 'export const add = (a, b) => a + b;\n' };
const TEST = { 'tests/add.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert';\nimport { add } from '../src/add.mjs';\ntest('U-1/AC-1 adds', () => assert.equal(add(1, 2), 3));\n" };
const LOG = { 'docs/log.md': '---\ntype: Log\ntitle: History\n---\n\n# History\n\n## 2026-01-01\n\n- **Creation** docs.\n' };

// A repo with an approved, carded, built and reviewed U-1; `opts` change one thing.
function setup({ profile = PROFILE, unit = {}, files = { ...CODE, ...TEST }, verdict = 'pass', beforeReview } = {}) {
  const dir = makeRepo({
    ...LOG,
    'docs/intents/I-1-math.md': intentDoc('I-1', 'Math'),
    [U1]: unitDoc({ scope: ['src/**', 'tests/**'], modules: ['core'], acs: ['- AC-1 (unit): adds two numbers.'], ...unit }),
  }, profile);
  approve(dir, 'I-1', 'U-1');
  assert.equal(run(dir, ['card', 'U-1']).code, 0);
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  commit(dir, 'build U-1', files);
  git(dir, 'switch', '-q', 'main');
  beforeReview?.(dir);
  if (verdict) review(dir, 'U-1', verdict);
  return dir;
}
const merge = (dir) => run(dir, ['merge', 'U-1']);
const codes = (r) => [...new Set([...r.out.matchAll(/^\S+:\d+ (\S+) /gm)].map((m) => m[1]))];

test('U6/AC-2 a passing gate merges --no-ff with trailers, writes index and log, removes the branch', () => {
  const dir = setup();
  const wt = join(mkdtempSync(join(tmpdir(), 'wt-')), 'w');
  git(dir, 'worktree', 'add', '-q', wt, 'unit/U-1');
  const r = merge(dir);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^merged U-1 as [0-9a-f]{40}$/m);
  const card = JSON.parse(read(dir, '.git/aidlc/cards/U-1.json')).hash;
  assert.equal(git(dir, 'log', '-1', '--format=%(trailers:only,unfold)').trim(), `Unit: U-1\nCard: ${card}\nReview: pass`);
  assert.equal(git(dir, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3, 'a merge commit');
  assert.match(read(dir, 'docs/log.md'), /- \*\*Update\*\* U-1 Unit merged\./);
  assert.ok(existsSync(join(dir, 'docs/units/index.md')), 'indexes written');
  assert.equal(git(dir, 'branch', '--list', 'unit/U-1'), '');
  assert.ok(!existsSync(wt), 'the unit worktree is removed');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.match(run(dir, ['status']).out, /^ {2}U-1 merged/m);
  assert.equal(run(dir, ['check', '--ci']).code, 0, run(dir, ['check', '--ci']).out);
});

// AC-1: each gate condition fails on its own fixture with its code and a fix.
const BROKEN = {
  'GATE-APPROVAL': () => setup({ beforeReview: (d) => write(d, { [U1]: read(d, U1).replace('adds two', 'adds three') }) }),
  'GATE-DEPS': () => setup({ unit: { depends: ['U-2'] }, beforeReview: (d) => { commit(d, 'u2', { 'docs/units/U-2-x.md': unitDoc({ scope: ['lib/**'] }) }); approve(d, 'U-2'); } }),
  'SCOPE-OUT': () => setup({ files: { ...CODE, ...TEST, 'lib/extra.mjs': '1;\n' } }),
  'GATE-LANE': () => setup({ beforeReview: (d) => write(d, { '.aidlc/profile.json': { ...PROFILE, lanes: { quick: [], full: ['src/add.mjs'] } } }) }),
  'GATE-AC': () => setup({ files: { ...CODE, 'tests/add.test.mjs': "import { test } from 'node:test';\ntest('adds', () => {});\n" } }),
  'GATE-LEVEL': () => setup({ files: { ...CODE, 'src/add.check.mjs': '// U-1/AC-1\n' } }),
  'GATE-PROOF': () => setup({ unit: { scope: ['db/**', 'tests/**'] }, files: { 'db/add.mjs': 'export const x = 1;\n', 'tests/db.test.mjs': "import { test } from 'node:test';\ntest('U-1/AC-1 always passes', () => {});\n" } }),
  'GATE-CHECK': () => setup({ profile: { ...PROFILE, modules: [{ id: 'core', paths: ['src/**'], check: FAIL }] } }),
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
  'ARCH-CHECK': () => setup({ profile: { ...PROFILE, architecture: { checks: [FAIL] } } }),
  'GATE-SHARED': () => setup({ unit: { scope: ['src/**', 'tests/**', 'docs/**'] }, files: { ...CODE, ...TEST, 'docs/log.md': 'edited by a builder\n' } }),
  'GATE-CONFLICT': () => setup({ unit: { scope: ['src/**', 'tests/**', 'README.md'] }, files: { ...CODE, ...TEST, 'README.md': 'unit\n' }, beforeReview: (d) => commit(d, 'base moves', { 'README.md': 'base\n' }) }),
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

test('U6/AC-4 a security content pattern outside the security folders requires a security verdict', () => {
  const dir = setup({ files: { 'src/add.mjs': 'export const add = (a, b) => a + b; // password check\n', ...TEST } });
  const r = merge(dir);
  assert.match(r.out, /GATE-SPECIALIST security review required \(an added line contains password\)/);
  review(dir, 'U-1', 'pass');
  const file = join(mkdtempSync(join(tmpdir(), 'v-')), 'v.json');
  write('/', { [file]: { verdict: 'pass', focus: 'security', findings: [] } });
  assert.equal(run(dir, ['review', 'record', 'U-1', file]).code, 0);
  assert.equal(merge(dir).code, 0);
});

test('U6/AC-8 proof-revert passes when the AC test needs the production change', () => {
  const dir = setup({ unit: { scope: ['db/**', 'tests/**'] }, files: { 'db/add.mjs': 'export const add = (a, b) => a + b;\n', 'tests/add.test.mjs': TEST['tests/add.test.mjs'].replace('../src/add.mjs', '../db/add.mjs') } });
  assert.equal(JSON.parse(read(dir, '.git/aidlc/cards/U-1.json')).lane, 'full');
  const r = merge(dir);
  assert.equal(r.code, 0, r.out);
});

test('U6/AC-9 boundaries: denied edges, same-service edges, approved exceptions', () => {
  const arch = { boundaries: [
    { from: 'internal/core/**', deny: ['internal/providers/**'], reason: 'core never uses a provider' },
    { from: 'cmd/*/**', deny: ['cmd/*/**'], same: false, reason: 'services build alone', except: ['docs/decisions/0009-x.md'] },
  ] };
  const edges = [['internal/core/a.go', 'internal/providers/b.go'], ['cmd/api/main.go', 'cmd/api/h.go'], ['cmd/api/main.go', 'cmd/web/h.go']];
  assert.deepEqual(boundaryFindings(edges, arch).map((f) => f.message), [
    'internal/core/a.go -> internal/providers/b.go: core never uses a provider',
    'cmd/api/main.go -> cmd/web/h.go: services build alone',
  ]);
  assert.equal(boundaryFindings(edges, arch, new Set(['docs/decisions/0009-x.md'])).length, 1, 'the approved exception clears its boundary');
});

test('U6/AC-3 and AC-10 check --ci flags merges without trailers or out of scope, and direct code commits, after adopted', () => {
  const dir = setup();
  assert.equal(merge(dir).code, 0);
  commit(dir, 'sneaky', { 'src/hack.mjs': '1;\n' });
  git(dir, 'switch', '-q', '-c', 'side');
  commit(dir, 'side work', { 'lib/x.mjs': '1;\n' });
  git(dir, 'switch', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', 'side', '-m', 'Merge side', '-m', 'Unit: U-1');
  let r = run(dir, ['check', '--ci']);
  assert.equal(r.code, 1);
  assert.match(r.out, /CI-COMMIT commit \w+ changes src\/hack\.mjs outside a unit/);
  assert.match(r.out, /CI-MERGE merge \w+ lacks the Card trailer/);
  assert.match(r.out, /CI-MERGE merge \w+ of U-1 changes lib\/x\.mjs, outside its scope/);

  const profile = JSON.parse(read(dir, '.aidlc/profile.json'));
  commit(dir, 'adopt here', { '.aidlc/profile.json': { ...profile, adopted: git(dir, 'rev-parse', 'HEAD') } });
  r = run(dir, ['check', '--ci']);
  assert.equal(r.code, 0, r.out);
});

test('U6/AC-6 push refuses a base commit that is neither a gate merge nor docs-only', () => {
  const remote = mkdtempSync(join(tmpdir(), 'remote-'));
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  const dir = setup();
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'main');
  assert.equal(merge(dir).code, 0);
  commit(dir, 'docs only', { 'docs/notes.md': '---\ntype: Note\n---\n' });
  let r = run(dir, ['push']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(git(remote, 'rev-parse', 'main'), git(dir, 'rev-parse', 'main'));
  commit(dir, 'code on base', { 'src/hack.mjs': '1;\n' });
  r = run(dir, ['push']);
  assert.equal(r.code, 1);
  assert.match(r.out, /PUSH-COMMIT commit \w+ changes src\/hack\.mjs outside a unit/);
  assert.notEqual(git(remote, 'rev-parse', 'main'), git(dir, 'rev-parse', 'main'));
});

test('U6/AC-7 fix writes a one-unit plan with a regression AC; quick needs no approval, standard does, full is refused', () => {
  const dir = makeRepo({}, { lanes: { quick: ['docs/**'], full: ['src/db/**'] } });
  let r = run(dir, ['fix', 'Typo in guide', '--scope', 'docs/guide/**']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^wrote docs\/units\/U-1-typo-in-guide\.md, quick lane\n$/);
  const doc = read(dir, 'docs/units/U-1-typo-in-guide.md');
  assert.match(doc, /^- AC-1 \(unit\): a regression test reproduces the problem and fails before the fix\.$/m);
  assert.doesNotMatch(doc, /^intent:/m);
  assert.equal(run(dir, ['check']).code, 0, run(dir, ['check']).out);
  commit(dir, 'fix unit');
  assert.match(run(dir, ['next']).out, /^build U-1/, 'quick lane: no approval');

  r = run(dir, ['fix', 'Rounding bug', '--scope', 'src/math/**']);
  assert.match(r.out, /U-2-rounding-bug\.md, standard lane; the owner approves it: ! node \.aidlc\/bin\/aidlc\.mjs approve U-2/);
  r = run(dir, ['fix', 'Bad migration', '--scope', 'src/db/**']);
  assert.equal(r.code, 2);
  assert.match(r.out, /needs an intent/);
  assert.equal(run(dir, ['fix', 'No scope']).code, 64);
});

test('U6/AC-1 a quick-lane unit owes no AC tests: its card carries no ACs', () => {
  const dir = setup({ unit: { scope: ['docs/guide/**'], modules: [] }, files: { 'docs/guide/a.md': '---\ntype: Note\ntitle: A\ndescription: A note.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\nText.\n' } });
  assert.equal(JSON.parse(read(dir, '.git/aidlc/cards/U-1.json')).lane, 'quick');
  const r = merge(dir);
  assert.doesNotMatch(r.out, /GATE-AC/);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(git(dir, 'log', '-1', '--format=%(trailers:only,unfold)'), /^Review: none$/m);
});

test('U6/AC-1 a quick-lane unit needs no review: its report makes it ready to merge', () => {
  const doc = { 'docs/guide/a.md': '---\ntype: Note\ntitle: A\ndescription: A note.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\nText.\n' };
  const dir = setup({ unit: { scope: ['docs/guide/**'], modules: [] }, files: doc, verdict: null });
  assert.match(run(dir, ['next']).out, /^wait for the builders of U-1|^restart the builder of U-1/);
  run(dir, ['report', 'U-1'], '{"status": "done"}');
  assert.match(run(dir, ['next']).out, /^merge U-1/);
  assert.equal(merge(dir).code, 0);
});
