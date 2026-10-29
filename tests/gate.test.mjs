import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, CHILD_ENV, CLI, commit, git, makeRepo, read, review, run, tempDir, write } from './state-repo.mjs';
import { CODE, codes, FAIL, FAIL_MERGED, LOG, merge, OK, PROFILE, setup, TEST } from './gate-repo.mjs';
import { boundaryFindings, moduleFindings } from '../plugin/cli/lib/index.mjs';

test('U6/AC-2 a passing gate merges --no-ff with trailers, writes index and log, removes the branch', () => {
  const dir = setup();
  const wt = join(tempDir('wt-'), 'w');
  git(dir, 'worktree', 'add', '-q', wt, 'unit/U-1');
  const r = merge(dir);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /^merged U-1 as [0-9a-f]{40}$/m);
  const card = JSON.parse(read(dir, '.git/aidlc/cards/U-1.json')).hash;
  assert.equal(git(dir, 'log', '-1', '--format=%(trailers:only,unfold)').trim(), `Unit: U-1\nCard: ${card}\nReview: pass\nTested: unit\nProof: unit`);
  assert.equal(git(dir, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3, 'a merge commit');
  assert.match(read(dir, 'docs/log.md'), /- \*\*Update\*\* U-1 Add merged\./);
  assert.ok(existsSync(join(dir, 'docs/units/index.md')), 'indexes written');
  assert.equal(git(dir, 'branch', '--list', 'unit/U-1'), '');
  assert.ok(!existsSync(wt), 'the unit worktree is removed');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  assert.match(run(dir, ['status']).out, /^ {2}U-1 merged/m);
  assert.equal(run(dir, ['check', '--ci']).code, 0, run(dir, ['check', '--ci']).out);
});


test('U6/AC-1 a unit that adds a test location to the profile passes GATE-LEVEL; a unit doc naming a tag is no test', () => {
  const widened = { ...PROFILE, levels: { unit: { paths: ['tests/**', 'src/*.check.mjs'], run: 'node --test' } } };
  const dir = setup({ unit: { scope: ['src/**', 'tests/**', '.aidlc/profile.json'] }, files: { ...CODE, 'src/add.check.mjs': '// U-1/AC-1\n', '.aidlc/profile.json': JSON.stringify(widened) } });
  const r = merge(dir);
  assert.ok(!codes(r).includes('GATE-LEVEL'), r.out);
  const doc = setup({ files: CODE, beforeReview: (d) => commit(d, 'card text', { 'docs/notes/U-1.md': '---\ntype: Note\ntitle: n\ndescription: d\n---\n\nA test tagged U-1/AC-1.\n' }) });
  assert.deepEqual(codes(merge(doc)).filter((c) => c.startsWith('GATE-A') || c === 'GATE-LEVEL'), ['GATE-AC']);
});

test('U75/AC-5 the checks see the indexes and log merge writes: a unit adding a doc passes a run that wants it indexed', () => {
  const indexed = 'node -e "process.exit(require(\'fs\').readFileSync(\'docs/notes/index.md\', \'utf8\').includes(\'n.md\') ? 0 : 1)" && node --test && git diff --exit-code';
  const note = { 'docs/notes/n.md': '---\ntype: Note\ntitle: N\ndescription: A note.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\nText.\n' };
  const dir = setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: indexed } } }, unit: { scope: ['src/**', 'tests/**', 'docs/notes/n.md'] }, files: { ...CODE, ...TEST, ...note } });
  const r = merge(dir);
  assert.equal(r.code, 0, r.out);
  assert.match(read(dir, 'docs/notes/index.md'), /n\.md/);
});

test('U78/AC-1 check --ci on GitHub Actions writes a job summary: the verdict, the findings with fixes, the plan states', () => {
  const dir = setup();
  assert.equal(merge(dir).code, 0);
  const summary = join(tempDir('summary-'), 'summary.md');
  const ci = (env) => spawnSync(process.execPath, [CLI, 'check', '--ci'], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  ci({});
  assert.ok(!existsSync(summary), 'none outside Actions');
  assert.equal(ci({ GITHUB_STEP_SUMMARY: summary }).status, 0);
  const text = readFileSync(summary, 'utf8');
  assert.match(text, /^## aidlc check\n\n⚠️ Passed with 3 warnings\.\n/);
  assert.match(text, /^\| ⚠️ \| PROFILE-NAMING \| `.aidlc\/profile.json:1` \| the profile has modules but no naming registry \(naming\.tokens\): nothing names them \| set naming\.tokens/m, 'U96/AC-2, B162');
  assert.match(text, /^\| ⚠️ \| HOUSE-GENERATED \| `docs\/units\/U-1-add\.md:1` \| .+ \| add generated: .+ \|$/m);
  assert.match(text, /^- \*\*I-1\*\* \w+: Math$/m);
  assert.match(text, /^ {2}- \*\*U-1\*\* merged: /m);
  commit(dir, 'a direct commit', { 'src/add.mjs': 'export const add = (a, b) => b + a;\n' });
  assert.equal(ci({ GITHUB_STEP_SUMMARY: summary }).status, 1);
  const failed = readFileSync(summary, 'utf8').slice(text.length);
  assert.match(failed, /^❌ 1 errors, 3 warnings\.$/m);
  assert.match(failed, /^\| ❌ \| CI-COMMIT \| `[^`]+` \| .+ \| .+ \|$/m);
});

test('U80/AC-1 a unit that carries its own except decision is told the owner approves it on the base first', () => {
  const doc = 'docs/decisions/0001-baseline.md';
  const arch = { graph: 'node -e "console.log(\'src/add.mjs -> lib/db.mjs\')"', boundaries: [{ from: 'src/**', deny: ['lib/**'], reason: 'src never uses lib', except: [doc] }] };
  const files = { ...CODE, ...TEST, '.aidlc/profile.json': JSON.stringify({ ...PROFILE, architecture: arch }), [doc]: '---\ntype: Decision\ntitle: 0001 Baseline\ndescription: Today\'s edges.\n---\n\n# Baseline\n- `src/add.mjs -> lib/db.mjs`\n' };
  const r = merge(setup({ unit: { scope: ['src/**', 'tests/**', '.aidlc/profile.json', doc] }, files }));
  assert.equal(r.code, 1);
  assert.match(r.out, /docs\/decisions\/0001-baseline\.md:1 ARCH-BOUNDARY docs\/decisions\/0001-baseline\.md comes with U-1, so the owner cannot approve it before this merge: the lead commits it on the base as a plan doc/);
});

test('U81/AC-2 an architecture command failing in check --ci names the CI job setup as the likely gap', () => {
  const dir = setup({ profile: { ...PROFILE, architecture: { checks: [FAIL] } } });
  const r = run(dir, ['check', '--ci']);
  assert.equal(r.code, 1);
  assert.match(r.out, /ARCH-CHECK node -e "process\.exit\(1\)" failed in CI; if it passes locally, the aidlc job lacks what it needs: add its toolchain setup to \.github\/workflows\/aidlc\.yml/);
});

test('U6/AC-8 a full-lane unit merges on its tests', () => {
  const dir = setup({ unit: { scope: ['db/**', 'tests/**'], twoWay: 'a pure function, no data' }, files: { 'db/add.mjs': 'export const add = (a, b) => a + b;\n', 'tests/add.test.mjs': TEST['tests/add.test.mjs'].replace('../src/add.mjs', '../db/add.mjs') } });
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
  const whole = new Map([['docs/decisions/0009-x.md', '# Decision\nServices may share code for now.\n']]);
  assert.equal(boundaryFindings(edges, arch, whole).length, 1, 'an approved exception that lists no edge clears its boundary');
  const listed = new Map([['docs/decisions/0009-x.md', '# Baseline\n- `cmd/api/main.go -> cmd/web/h.go`\n']]);
  assert.equal(boundaryFindings(edges, arch, listed).length, 1, 'a listed edge is covered');
  const other = [...edges, ['cmd/api/main.go', 'cmd/admin/x.go']];
  assert.deepEqual(boundaryFindings(other, arch, listed).map((f) => f.message), [
    'internal/core/a.go -> internal/providers/b.go: core never uses a provider',
    'cmd/api/main.go -> cmd/admin/x.go: services build alone',
  ], 'an edge the decision does not list still fails');
});

test('U86/AC-1 data: a module reaches only the data it owns or shared data; every data node has one owner; a baseline lists edges', () => {
  const profile = {
    modules: [
      { id: 'scope', paths: ['internal/scope/**'], data: ['data/regional/scopes'] },
      { id: 'registry', paths: ['internal/registry/**'], data: ['data/regional/providers'] },
      { id: 'audit', paths: ['internal/audit/**'], data: ['data/*/providers'] },
    ],
    architecture: { data: { prefix: 'data/', shared: ['data/*/outbox'], except: ['docs/decisions/0011-data.md'] } },
  };
  const edges = [
    ['internal/scope', 'data/regional/scopes'], ['internal/scope', 'data/regional/outbox'], ['internal/scope/x.go', 'internal/registry'],
    ['internal/registry', 'data/regional/scopes'], ['internal/scope', 'data/global/tenants'],
  ];
  assert.deepEqual(moduleFindings(edges, profile).map((f) => [f.code, f.message]), [
    ['ARCH-DATA', "internal/registry -> data/regional/scopes: data/regional/scopes belongs to scope; reach it through scope's interface, an integration event or a shared service"],
    ['ARCH-DATA', 'internal/scope -> data/global/tenants: no module owns data/global/tenants; add it to one module\'s data, or to architecture.data.shared'],
  ], 'own data, shared data and import edges pass');
  assert.deepEqual(moduleFindings([['internal/registry', 'data/regional/providers']], profile).map((f) => f.message),
    ['data/regional/providers is claimed by registry, audit; one module owns it']);
  const baseline = new Map([['docs/decisions/0011-data.md', '# Baseline\n- `internal/registry -> data/regional/scopes`\n']]);
  assert.equal(moduleFindings(edges, profile, baseline).length, 1, 'a listed crossing is covered, the unowned node still fails');
  assert.deepEqual(moduleFindings(edges, { modules: profile.modules }), [], 'off without architecture.data');
});

test('U87/AC-1 api: another module depends only on a module\'s public paths; a module without api is not checked', () => {
  const profile = {
    modules: [{ id: 'scope', paths: ['internal/scope/**'], api: ['internal/scope', 'internal/scope/events/**'] }, { id: 'registry', paths: ['internal/registry/**'] }],
    architecture: { api: { except: ['docs/decisions/0012-api.md'] } },
  };
  const edges = [['internal/registry', 'internal/scope'], ['internal/registry', 'internal/scope/events/v1'], ['internal/registry', 'internal/scope/store'],
    ['internal/scope/store', 'internal/scope/domain'], ['internal/scope', 'internal/registry/store'], ['internal/registry', 'third/party']];
  assert.deepEqual(moduleFindings(edges, profile).map((f) => [f.code, f.message]), [
    ['ARCH-API', 'internal/registry -> internal/scope/store: internal/scope/store is inside scope; depend only on its public paths (internal/scope, internal/scope/events/**)'],
  ]);
  const baseline = new Map([['docs/decisions/0012-api.md', '- `internal/registry -> internal/scope/store`\n']]);
  assert.deepEqual(moduleFindings(edges, profile, baseline), []);
});

test('U87/AC-2 acyclic: modules that depend on each other in a circle fail once per circle; a listed module edge breaks it', () => {
  const modules = ['a', 'b', 'c', 'd'].map((id) => ({ id, paths: [`m/${id}/**`] }));
  const edges = [['m/a/x', 'm/b/y'], ['m/b/y', 'm/c'], ['m/c', 'm/a/z'], ['m/c/q', 'm/b'], ['m/d', 'm/a']];
  const on = { modules, architecture: { acyclic: { except: ['docs/decisions/0013-cycles.md'] } } };
  assert.deepEqual(moduleFindings(edges, on).map((f) => f.message), [
    'modules depend on each other in a circle: a -> b -> c -> a',
    'modules depend on each other in a circle: b -> c -> b',
  ]);
  const broken = new Map([['docs/decisions/0013-cycles.md', '- `c -> a`\n- `c -> b`\n']]);
  assert.deepEqual(moduleFindings(edges, on, broken), []);
  assert.deepEqual(moduleFindings(edges, { modules }), [], 'off without architecture.acyclic');
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
  assert.match(r.out, /CI-COMMIT commit \w+ changes src\/hack\.mjs outside a bolt/);
  assert.match(r.out, /CI-MERGE merge \w+ lacks the Card trailer/);
  assert.match(r.out, /CI-MERGE merge \w+ of U-1 changes lib\/x\.mjs, outside its scope/);

  const profile = JSON.parse(read(dir, '.aidlc/profile.json'));
  commit(dir, 'adopt here', { '.aidlc/profile.json': { ...profile, adopted: git(dir, 'rev-parse', 'HEAD') } });
  r = run(dir, ['check', '--ci']);
  assert.equal(r.code, 0, r.out);
});

test('U6/AC-6 push refuses a base commit that is neither a gate merge nor docs-only', () => {
  const remote = tempDir('remote-');
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
  assert.match(r.out, /PUSH-COMMIT commit \w+ changes src\/hack\.mjs outside a bolt/);
  assert.notEqual(git(remote, 'rev-parse', 'main'), git(dir, 'rev-parse', 'main'));
});

test('U6/AC-7 U18/AC-5 U58/AC-1 fix writes a one-unit plan with a regression AC; quick needs no approval, standard and full do', () => {
  const dir = makeRepo({}, { lanes: { quick: ['docs/**'], full: ['src/db/**'] } });
  let r = run(dir, ['fix', 'Typo in guide', '--scope', 'docs/guide/**']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^wrote docs\/units\/U-1-typo-in-guide\.md, quick lane\n$/);
  const doc = read(dir, 'docs/units/U-1-typo-in-guide.md');
  assert.match(doc, /^- AC-1 \(unit\): Given the input that showed the problem, when it runs, then the result is right; its regression test fails before the fix\.$/m);
  assert.doesNotMatch(doc, /^intent:/m);
  assert.equal(run(dir, ['check']).code, 0, run(dir, ['check']).out);
  commit(dir, 'fix unit');
  assert.match(run(dir, ['next']).out, /^build U-1/, 'quick lane: no approval');

  r = run(dir, ['fix', 'Rounding bug', '--scope', 'src/math/**']);
  assert.match(r.out, /U-2-rounding-bug\.md, standard lane; the owner approves it: aidlc approve U-2/);
  r = run(dir, ['fix', 'Bad migration', '--scope', 'src/db/**']);
  assert.equal(r.code, 1, 'U58/AC-1 written, but plan lint asks for its decision');
  assert.match(r.out, /^docs\/units\/U-3-bad-migration\.md does not pass plan lint yet: fix each finding below, then run aidlc check docs\/units\/U-3-bad-migration\.md\ndocs\/units\/U-3-bad-migration\.md:\d+ PLAN-DECISION /m);
  assert.match(r.out, /U-3-bad-migration\.md, full lane; the owner approves it: aidlc approve U-3/);
  commit(dir, 'full fix');
  assert.match(run(dir, ['status']).out, /^ {2}U-3 draft/m, 'the full-lane fix waits for the owner');
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
  assert.match(run(dir, ['next']).out, /^wait for the builders and reviewers of U-1|^restart the builder of U-1/);
  run(dir, ['report', 'U-1'], '{"status": "done"}');
  assert.match(run(dir, ['next']).out, /^merge U-1/);
  assert.equal(merge(dir).code, 0);
});

test('U6/AC-1 an empty diff does not raise the lane', () => {
  const dir = setup({ beforeReview: (d) => { git(d, 'switch', '-q', 'unit/U-1'); git(d, 'revert', '--no-edit', 'HEAD'); git(d, 'switch', '-q', 'main'); } });
  assert.doesNotMatch(merge(dir).out, /GATE-LANE/);
});

test('U6/AC-1 a refused merge is not offered again until the base or the diff changes', () => {
  const dir = setup({ profile: { ...PROFILE, modules: [{ id: 'core', paths: ['src/**'], check: FAIL }] } });
  assert.match(run(dir, ['next']).out, /^merge U-1/);
  assert.equal(merge(dir).code, 1);
  const r = run(dir, ['next']);
  assert.match(r.out, /^⛔ the gate refused U-1 \(GATE-CHECK; aidlc merge U-1 lists them\)/);
  assert.equal(r.code, 2);
  commit(dir, 'the base moves', { 'docs/note.md': 'x\n' });
  assert.match(run(dir, ['next']).out, /^merge U-1/);
});

test('U18/AC-1 the card lists every level run; the gate runs them on the merge result and records them', () => {
  const card = run(setup(), ['card', 'U-1']).out;
  assert.match(card, /^## Test runs \(each in full, as one plain command\)\n- unit: node --test$/m);
  const failing = setup({ unit: { acs: ['- AC-1 (e2e): adds two numbers.'] }, profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: 'node --test' }, e2e: { paths: ['tests/**'], run: FAIL_MERGED } } } }); // an e2e AC, as PLAN-SLICE asks
  assert.match(merge(failing).out, /GATE-RUN level e2e run node -e .* fails on the merge result/);
  const none = setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'] } } } });
  assert.equal(merge(none).code, 0);
  assert.match(git(none, 'log', '-1', '--format=%(trailers:only,unfold)'), /^Tested: none$/m);
});

test('U18/AC-2 a quick unit passes the gate only when the commands its ACs name pass on the merge result', () => {
  const quick = (ac) => setup({
    unit: { scope: ['docs/guide/**'], modules: [], acs: [`- AC-1 (unit): \`${ac}\` passes.`] },
    files: { 'docs/guide/a.md': '---\ntype: Note\ntitle: A\ndescription: A note.\ngenerated: { by: x/1, at: 2026-01-01T00:00:00Z }\n---\n\nText.\n' },
    beforeReview: (d) => commit(d, 'scripts', { 'package.json': JSON.stringify({ scripts: { 'docs-ok': OK, 'docs-bad': FAIL } }) }),
  });
  const bad = merge(quick('npm run docs-bad'));
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /GATE-AC AC-1 names npm run docs-bad, which fails on the merge result/);
  const good = merge(quick('npm run docs-ok'));
  assert.equal(good.code, 0, good.out + good.err);
});

test('U13/AC-4 push on a base never pushed checks only the commits after the one that added the profile', () => {
  const remote = tempDir('remote-');
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  const dir = tempDir('history-');
  git(dir, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.email', 'owner@example.com'], ['user.name', 'Owner'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git(dir, 'config', k, v);
  commit(dir, 'code from before the plugin', { 'src/old.mjs': '1;\n' });
  commit(dir, 'adopt', { '.aidlc/profile.json': JSON.stringify(PROFILE), ...LOG });
  commit(dir, 'docs only', { 'docs/notes.md': '---\ntype: Note\n---\n' });
  git(dir, 'remote', 'add', 'origin', remote);
  const r = run(dir, ['push']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(git(remote, 'rev-parse', 'main'), git(dir, 'rev-parse', 'main'));
});


test('U98/AC-2 check --ci runs deps.check, so an advisory published after a merge turns the base red', () => {
  const dir = setup();
  assert.equal(merge(dir).code, 0);
  commit(dir, 'a scanner', { '.aidlc/profile.json': { ...PROFILE, deps: { manifests: ['package.json'], check: [FAIL] } } });
  const r = run(dir, ['check', '--ci']);
  assert.equal(r.code, 1);
  assert.match(r.out, /CI-DEPENDENCY .+ reports a dependency with a known advisory or out of date → plan a fix bolt/);
  commit(dir, 'clean', { '.aidlc/profile.json': { ...PROFILE, deps: { manifests: ['package.json'], check: [OK] } } });
  assert.doesNotMatch(run(dir, ['check', '--ci']).out, /CI-DEPENDENCY/);
});

test('U109/AC-1 gate level runs bypass test caches (gate.fresh), added to the value already set', () => {
  const check = 'node -e "process.exit(/^-mod=mod -count=1$/.test(process.env.GOFLAGS) ? 0 : 1)"';
  const dir = setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: `${check} && node --test` } } } });
  const r = spawnSync(process.execPath, [CLI, 'merge', 'U-1'], { cwd: dir, encoding: 'utf8', env: { ...CHILD_ENV, GOFLAGS: '-mod=mod' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('U114/AC-2 a level red on the base alone is GATE-BASE: only fix bolts build or merge, and next asks for one', () => {
  const dir = setup({ profile: { ...PROFILE, levels: { unit: { paths: ['tests/**'], run: `node --test && ${FAIL}` } } } });
  const r = merge(dir);
  assert.equal(r.code, 1);
  assert.deepEqual(codes(r), ['GATE-BASE'], r.out);
  assert.match(r.out, /level unit run .* fails on the base alone too → not this bolt's to fix/);
  assert.match(run(dir, ['next']).out, /^the base fails its unit level on its own \(found merging U-1\): only a fix bolt builds or merges/);
  commit(dir, 'a plan commit', { 'docs/notes.md': '---\ntype: Note\n---\n' });
  assert.match(run(dir, ['next']).out, /^the base fails its unit level/, 'a plan commit keeps it red');
  assert.equal(run(dir, ['fix', 'the unit level', '--scope', 'docs/guide/**']).code, 0);
  assert.doesNotMatch(run(dir, ['next']).out, /merge U-1/, 'U-1 waits while the fix unit is live');
});

test('0.220.6 a merge commit may change what merge itself writes: codebase map pages, traceability, glossary, context map', () => {
  const dir = setup();
  git(dir, 'switch', '-q', '-c', 'side');
  commit(dir, 'side work', { 'src/y.mjs': '1;\n' });
  git(dir, 'switch', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'side');
  write(dir, { 'docs/codebase-map-graph.md': 'x\n', 'docs/architecture/traceability-i-1.md': 'x\n', 'docs/naming/glossary.md': 'x\n', 'docs/architecture/context-map.md': 'x\n' });
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'Merge U-1', '-m', 'Unit: U-1\nCard: x\nReview: x');
  const r = run(dir, ['check', '--ci']);
  assert.doesNotMatch(r.out, /outside its scope/, r.out);
});
