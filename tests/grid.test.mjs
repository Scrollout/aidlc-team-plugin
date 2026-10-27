import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeLane, lintPlan as lintAll, readPlan, inside, overlaps } from '../plugin/cli/lib/index.mjs';
import { git, tempDir } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const PLAN = join(ROOT, 'tests/fixtures/plan');
const CLI = join(ROOT, 'plugin/cli/aidlc.mjs');
// PLAN-DESIGN has its own tests (tests/design.test.mjs); these units carry no design on purpose.
const lintPlan = (...args) => lintAll(...args).filter((f) => f.code !== 'PLAN-DESIGN');
const lint = (name, profile = {}, opts = {}) => lintPlan(join(PLAN, name), profile, { base: PLAN, ...opts });
const codes = (findings) => [...new Set(findings.map((f) => f.code))];

function project(files) {
  const dir = tempDir('grid-');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return dir;
}

test('every PLAN fixture fires only its own code; the clean plan has none', () => {
  for (const name of readdirSync(PLAN).filter((n) => n.startsWith('PLAN-'))) {
    assert.deepEqual(codes(lint(name)), [name.match(/^PLAN-[A-Z]+/)[0]], name);
  }
  assert.deepEqual(lint('clean'), []);
  const { units, intents } = readPlan(join(PLAN, 'clean'));
  assert.deepEqual(units.map((u) => u.id), ['U-1', 'U-2', 'U-3']);
  assert.deepEqual(intents.map((i) => i.id), ['I-1']);
  assert.deepEqual(units[1].depends, ['U-1']);
  assert.deepEqual(units[0].acs.map((a) => [a.id, a.level]), [['AC-1', 'unit'], ['AC-2', 'integration']]);
});

test('U3/AC-1 a depends cycle is PLAN-DAG naming the cycle', () => {
  const found = lint('PLAN-DAG-cycle');
  assert.equal(found.length, 1);
  assert.equal(found[0].code, 'PLAN-DAG');
  assert.match(found[0].message, /depends cycle U-1 → U-3 → U-2 → U-1$/);
  assert.match(lint('PLAN-DAG-unknown')[0].message, /U-1 depends on U-9/);
});

test('U3/AC-2 a duplicate AC ID or a duplicate reservation is a finding', () => {
  const ac = lint('PLAN-AC');
  assert.equal(ac.length, 1);
  assert.match(ac[0].message, /AC-2 appears more than once in U-1/);
  const dup = lint('PLAN-RESERVE-duplicate');
  assert.equal(dup.length, 1);
  assert.match(dup[0].message, /migration regional\/5 is also reserved by U-1/);
  assert.equal(dup[0].path, 'PLAN-RESERVE-duplicate/units/U-2-b.md');
  assert.equal(lint('PLAN-RESERVE-malformed').length, 1);
  assert.match(lint('clean', { reserve: { schema: {} } })[0].message, /kind migration is not in profile\.reserve/);
});

test('U3/AC-3 overlapping scopes with no depends path are PLAN-SCOPE; a path or a dropped unit clears it', () => {
  const found = lint('PLAN-SCOPE-overlap');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /U-2 scope internal\/auth\/\*\* overlaps U-1 scope internal\/\*\*/);
  assert.deepEqual(lint('PLAN-SCOPE-overlap', {}, { skip: ['U-1'] }), [], 'merged units are skipped');
  assert.deepEqual(lint('dropped'), []);
  assert.deepEqual(lint('clean'), [], 'U-2 overlaps U-1 but depends on it');
});

test('U3/AC-4 globs: overlap and containment', () => {
  assert.ok(overlaps('internal/**', 'internal/auth/**'));
  assert.ok(overlaps('*.md', 'docs/a.md'));
  assert.ok(!overlaps('docs/**', 'src/**'));
  assert.ok(!overlaps('src/*.go', 'src/x/y.go'));
  assert.ok(inside('docs/a.md', 'docs/**'));
  assert.ok(inside('README.md', '*.md'));
  assert.ok(!inside('**', 'docs/**'));
  assert.ok(!inside('a*c', 'a?c'));
  assert.ok(!overlaps('/README.md', 'docs/**'));
});

test('U3/AC-4 lane is quick, standard or full per the profile globs, with the match as the reason', () => {
  const profile = { lanes: { quick: ['docs/**', '*.md'], full: ['migrations/**'] }, focus: { security: ['internal/auth/**'] } };
  assert.deepEqual(computeLane(['docs/guide/**', '/README.md'], profile), { lane: 'quick', reason: 'every path is inside lanes.quick' });
  assert.equal(computeLane(['README.md'], profile).lane, 'full', 'an unanchored name may sit under migrations/');
  assert.deepEqual(computeLane(['README.md', 'docs/a.md'], profile, { paths: true }), { lane: 'quick', reason: 'every path is inside lanes.quick' });
  assert.deepEqual(computeLane(['docs/**', 'internal/pricing/**'], profile).lane, 'standard');
  assert.match(computeLane(['docs/**', 'internal/pricing/**'], profile).reason, /^internal\/pricing\/\*\* is outside lanes\.quick/);
  assert.deepEqual(computeLane(['migrations/0005_x.sql'], profile), { lane: 'full', reason: 'migrations/0005_x.sql overlaps lanes.full migrations/**' });
  assert.deepEqual(computeLane(['internal/**'], profile), { lane: 'full', reason: 'internal/** overlaps focus.security internal/auth/**' });
  assert.equal(computeLane(['src/**'], {}).lane, 'standard');
});

test('U3/AC-4 aidlc lane <unit> and lane --diff <range>', () => {
  const unit = (scope) => `---\ntype: Unit\ntitle: A\ndescription: A.\nscope: [${scope}]\n---\n\n- AC-1 (unit): x.\n`;
  const dir = project({
    '.aidlc/profile.json': { lanes: { quick: ['docs/**'], full: ['migrations/**'] } },
    'docs/units/U-1-a.md': unit('"docs/guide/**"'),
    'docs/units/U-2-b.md': unit('"migrations/**"'),
  });
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  assert.equal(run('lane', 'U-1').stdout, 'quick every path is inside lanes.quick\n');
  assert.match(run('lane', 'U-2').stdout, /^full migrations\/\*\* overlaps lanes\.full migrations\/\*\*\n$/);
  assert.equal(run('lane', 'U-9').status, 64);
  assert.equal(run('lane').status, 64);

  git(dir, 'init', '-q');
  git(dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  mkdirSync(join(dir, 'migrations'));
  writeFileSync(join(dir, 'migrations/0001_init.sql'), 'select 1;\n');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'change');
  assert.match(run('lane', '--diff', 'HEAD~1..HEAD').stdout, /^full migrations\/0001_init\.sql overlaps lanes\.full migrations\/\*\*/);
});

test('U3/AC-5 an AC without a level, or with one the profile does not define, is a finding', () => {
  assert.match(lint('PLAN-LEVEL-missing')[0].message, /AC-1 has no level/);
  assert.match(lint('PLAN-LEVEL-unknown')[0].message, /AC-1 level smoke is not one of unit, integration, e2e/);
  const narrow = lint('clean', { levels: { unit: {}, e2e: {} } });
  assert.deepEqual(narrow.map((f) => f.message), ['AC-2 level integration is not one of unit, e2e']);
  assert.deepEqual(lint('PLAN-LEVEL-unknown', { levels: { smoke: {} } }), []);
});

test('U3 plan lint runs inside aidlc check and exits 1', () => {
  const r = spawnSync(process.execPath, [CLI, 'check', join(PLAN, 'PLAN-AC')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PLAN-AC AC-2 appears more than once/);
});

test('U3/AC-3 PLAN-SHARED: a scope naming a bundle index or log, or a shared file, is a finding', () => {
  const found = lint('PLAN-SHARED', { shared: ['go.sum'] });
  assert.deepEqual(found.map((f) => f.message), [
    'U-1 scope PLAN-SHARED/guide/index.md names a file only merge writes',
    'U-1 scope PLAN-SHARED/log.md names a file only merge writes',
  ]);
  const dir = project({ 'docs/units/U-1-a.md': '---\ntype: Unit\ntitle: A\ndescription: A.\nscope: ["go.sum", "web/index.md"]\n---\n\n- AC-1 (unit): x.\n' });
  assert.deepEqual(lintPlan(join(dir, 'docs'), { shared: ['go.sum'] }, { base: dir }).map((f) => f.code), ['PLAN-SHARED'], 'an index.md outside the bundle is fine');
});

const unitDoc = (fm, acs) => `---\ntype: Unit\ntitle: A\ndescription: A.\n${fm}\n---\n\n# Acceptance criteria\n\n${acs}\n`;

test('U17/AC-1 a non-quick unit whose scope cannot hold an AC test is PLAN-TEST naming the AC and level', () => {
  const profile = { lanes: { quick: ['docs/**'] }, levels: { unit: { paths: ['**/*_test.go'] }, integration: { paths: ['tests/integration/**'] }, e2e: {} } };
  const dir = project({
    'docs/units/U-1-a.md': unitDoc('scope: ["internal/pricing/**"]', '- AC-1 (unit): rounds.\n- AC-2 (integration): reads rates.\n- AC-3 (e2e): renders.'),
    'docs/units/U-2-b.md': unitDoc('scope: ["internal/rates/**", "tests/integration/rates/**"]', '- AC-1 (integration): reads rates.'),
    'docs/units/U-3-c.md': unitDoc('scope: ["docs/guide/**"]', '- AC-1 (integration): the guide renders.'),
  });
  const found = lintPlan(join(dir, 'docs'), profile, { base: dir });
  assert.deepEqual(found.map((f) => [f.code, f.path, f.line, f.message]), [
    ['PLAN-TEST', 'docs/units/U-1-a.md', 11, 'AC-2 (integration) has no test location: no scope glob overlaps levels.integration.paths tests/integration/**'],
  ], 'unit tests fit internal/**, e2e has no paths, U-2 holds its test, quick U-3 adds none');
});

test('U17/AC-2 a bare root-file scope overlapping a ** glob suggests the leading /', () => {
  const dir = project({
    'docs/units/U-1-a.md': unitDoc('intent: I-1\nscope: ["build/**"]', '- AC-1 (unit): x.'),
    'docs/units/U-2-b.md': unitDoc('intent: I-1\nscope: ["Makefile"]', '- AC-1 (unit): x.'),
    'docs/units/U-3-c.md': unitDoc('intent: I-1\ndepends: [U-1]\nscope: ["go.mod"]', '- AC-1 (unit): x.'),
    'docs/units/U-4-d.md': unitDoc('intent: I-1\ndepends: [U-1]\nscope: ["go.mod"]', '- AC-1 (unit): x.'),
    'docs/units/U-5-e.md': unitDoc('intent: I-1\nscope: ["/README.md"]', '- AC-1 (unit): x.'),
  });
  const found = lintPlan(join(dir, 'docs'), {}, { base: dir }).map((f) => f.message);
  assert.deepEqual(found, [
    'U-2 scope Makefile overlaps U-1 scope build/** with no depends path between them; a name without / matches at any depth, write /Makefile for the root file',
    'U-4 scope go.mod overlaps U-3 scope go.mod with no depends path between them',
  ], 'the same bare name in two units is a real overlap; /README.md overlaps nothing');
});

test('U17/AC-3 an AC naming another unit\'s file or target needs a depends path to it', () => {
  const found = lint('PLAN-DEPENDS');
  assert.deepEqual(found.map((f) => [f.path, f.line, f.message]), [
    ['PLAN-DEPENDS/units/U-2-b.md', 11, 'AC-1 names tools/check.mjs, an output of U-1, with no depends path to it'],
  ]);
  const files = {
    'Makefile': 'test:\n\tgo test ./...\n',
    'docs/units/U-6-a.md': unitDoc('scope: ["docs/guide/**"]', '- AC-3 (unit): `make docs-check` and `make test` pass.'),
    'docs/units/U-9-b.md': unitDoc('scope: ["/Makefile", "tools/**"]', '- AC-1 (unit): `make docs-check` runs the link check.'),
    'docs/units/U-10-c.md': unitDoc('depends: [U-9]\nscope: ["/Makefile"]', '- AC-1 (unit): `make lint` runs.'),
  };
  const dir = project(files);
  assert.deepEqual(lintPlan(join(dir, 'docs'), {}, { base: dir }).map((f) => f.message), [
    'AC-3 names make docs-check, an output of U-9, with no depends path to it',
  ], 'make test is on the base Makefile; U-10 edits the Makefile but never names docs-check');
  writeFileSync(join(dir, 'docs/units/U-6-a.md'), unitDoc('depends: [U-9]\nscope: ["docs/guide/**"]', '- AC-3 (unit): `make docs-check` passes.'));
  assert.deepEqual(lintPlan(join(dir, 'docs'), {}, { base: dir }), [], 'a depends path clears it');
  assert.deepEqual(lint('PLAN-DEPENDS', {}, { skip: ['U-1'] }), [], 'a merged unit\'s output is on the base');
});

test('U22/AC-1 U22/AC-2 a scope holding the profile may add its test location; a module the profile lacks is PLAN-MODULE', () => {
  const profile = { levels: { unit: { paths: ['tests/unit/**'] } }, modules: [{ id: 'api', paths: ['internal/**'] }, { name: 'sdk-ts', paths: ['sdk/ts/**'] }] };
  const dir = project({
    'docs/units/U-1-a.md': unitDoc('scope: ["sdk/ts/**", "/.aidlc/profile.json"]\nmodules: [sdk-ts]', '- AC-1 (unit): installs.'),
    'docs/units/U-2-b.md': unitDoc('scope: ["web/**"]\nmodules: [api, web]', '- AC-1 (unit): renders.'),
  });
  const found = lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code !== 'PLAN-INCREMENT'); // U43 has its own test
  assert.deepEqual(found.map((f) => [f.code, f.path, f.message]), [
    ['PLAN-MODULE', 'docs/units/U-2-b.md', 'U-2 names module web, which profile.modules lacks (has: api, sdk-ts)'],
    ['PLAN-TEST', 'docs/units/U-2-b.md', 'AC-1 (unit) has no test location: no scope glob overlaps levels.unit.paths tests/unit/**'],
  ], 'U-1 adds its test location to the profile with its test; a module keyed by name counts');
});

test('U75/AC-1 PLAN-DECISION names the scope glob that reaches the door and suggests anchoring a bare name', () => {
  const dir = project({ 'docs/units/U-1-a.md': '---\ntype: Unit\ntitle: A\ndescription: A.\nscope: [".aidlc/profile.json", "Makefile"]\n---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n' });
  const doors = () => lintPlan(join(dir, 'docs'), { lanes: { full: ['migrations/**'] } }, { base: dir }).filter((f) => f.code === 'PLAN-DECISION').map((f) => f.message);
  assert.deepEqual(doors(), ['U-1 touches the one-way door migrations/** through scope Makefile and links no decision (a bare name matches at any depth: write /Makefile for the root file)']);
  const file = join(dir, 'docs/units/U-1-a.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"Makefile"', '"/Makefile"'));
  assert.deepEqual(doors(), [], 'an anchored name stays at the root');
});

test('U37/AC-1 a unit at a one-way door links a decision or says why it is two-way, else PLAN-DECISION names the door', () => {
  const linked = (scope, body, fm = '') => `---\ntype: Unit\ntitle: A\ndescription: A.\nscope: ${JSON.stringify(scope)}\n${fm}---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n\n${body}\n`;
  const dir = project({
    'docs/decisions/0001-keep-table.md': '---\ntype: Decision\ntitle: 0001 Keep the table\ndescription: Keep it.\n---\n\n# Decision\nKeep.\n',
    'docs/architecture/api.md': '---\ntype: Design\ntitle: API\ndescription: The API.\n---\n\n# Shape\nx\n',
    'docs/units/U-1-a.md': linked(['migrations/0001.sql'], ''),
    'docs/units/U-2-b.md': linked(['migrations/0002.sql'], '# Logical\n- [Keep the table](../decisions/0001-keep-table.md)'),
    'docs/units/U-3-c.md': linked(['migrations/0003.sql'], '', 'twoWay: "a new table the next migration can drop"\n'),
    'docs/units/U-4-d.md': linked(['docs/architecture/api.md', 'src/a/**'], '# Interfaces\n- [API](../architecture/api.md)'),
    'docs/units/U-5-e.md': linked(['src/b/**'], '# Interfaces\n- [API](../architecture/api.md)'),
  });
  const doors = (profile) => lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-DECISION').map((f) => [f.path, f.message]);
  assert.deepEqual(doors({ lanes: { full: ['migrations/**'] } }), [
    ['docs/units/U-1-a.md', 'U-1 touches the one-way door migrations/** through scope migrations/0001.sql and links no decision'],
    ['docs/units/U-4-d.md', 'U-4 touches the one-way door docs/architecture/api.md through scope docs/architecture/api.md and links no decision'],
  ], 'a linked decision or twoWay clears it; consuming an interface is no door');
  assert.deepEqual(doors({ lanes: { full: ['migrations/**'] }, decisions: { paths: ['schema/**'] } }).map(([p]) => p), ['docs/units/U-4-d.md'], 'decisions.paths replaces lanes.full');
  assert.deepEqual(doors({ focus: { security: ['migrations/**'] } }).map(([p]) => p), ['docs/units/U-4-d.md'], 'a focus glob alone is no door');
  assert.match(lintPlan(join(dir, 'docs'), { lanes: { full: ['migrations/**'] } }, { base: dir }).find((f) => f.code === 'PLAN-DECISION').fix, /Decision doc .*options, choice, why.*twoWay: "<why it is easy to undo>"/);
});

test('0.46.1 a bundle-root link to a decision clears PLAN-DECISION', () => {
  const dir = project({
    'docs/decisions/0001-keep.md': '---\ntype: Decision\ntitle: 0001 Keep\ndescription: Keep it.\n---\n\n# Decision\nKeep.\n',
    'docs/units/U-1-a.md': '---\ntype: Unit\ntitle: A\ndescription: A.\nscope: ["migrations/0001.sql"]\n---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n\n# Logical\n- [Keep](/decisions/0001-keep.md)\n',
  });
  assert.deepEqual(lintPlan(join(dir, 'docs'), { lanes: { full: ['migrations/**'] } }, { base: dir }).filter((f) => f.code === 'PLAN-DECISION'), []);
});

test('U40/AC-1 U40/AC-2 U40/AC-3 a scope names both sides of a generated entry, and no existing file git does not track', () => {
  const unit = (scope) => `---\ntype: Unit\ntitle: A\ndescription: A.\nscope: ${JSON.stringify(scope)}\n---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n`;
  const dir = project({
    '.gitignore': 'sdk/\n',
    'api/tsp/main.tsp': 'model A {}\n',
    'api/openapi/kernel.yaml': 'openapi: 3.1.0\n',
    'sdk/schema.d.ts': '// generated, ignored\n',
    'web/schema.d.ts': '// generated, tracked\n',
    'docs/units/U-1-a.md': unit(['api/openapi/kernel.yaml']),
    'docs/units/U-2-b.md': unit(['api/tsp/**']),
    'docs/units/U-3-c.md': unit(['api/tsp/**', 'api/openapi/**', 'web/schema.d.ts']),
    'docs/units/U-4-d.md': unit(['sdk/schema.d.ts']),
    'docs/units/U-5-e.md': unit(['src/new.mjs']),
    'Makefile': 'all:\n',
    'docs/units/U-6-f.md': unit(['/Makefile']),
  });
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  const profile = { generated: [{ outputs: ['api/openapi/*.yaml', 'web/schema.d.ts'], sources: ['api/tsp/**'] }] };
  const found = lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-GENERATED').map((f) => [f.path, f.message]);
  assert.deepEqual(found, [
    ['docs/units/U-1-a.md', 'U-1 scope names api/openapi/*.yaml but not api/tsp/**: a generator links them'],
    ['docs/units/U-2-b.md', 'U-2 scope names api/tsp/** but not api/openapi/*.yaml, web/schema.d.ts: a generator links them'],
    ['docs/units/U-4-d.md', 'U-4 scope names sdk/schema.d.ts, which exists but git does not track: a builder cannot commit it'],
  ], 'both sides pass; a new file passes; a root-anchored tracked file passes');
  assert.match(lintPlan(join(dir, 'docs'), profile, { base: dir }).find((f) => f.code === 'PLAN-GENERATED').fix, /generated entry/);
});

test('U43/AC-1 U43/AC-2 an intent ends to end once; a unit crossing modules is tested above the first level', () => {
  const intent = (id, fm = '') => `---\ntype: Intent\ntitle: ${id}\ndescription: ${id}.\n${fm}---\n\n# Goal\nx\n`;
  const unit = (intentId, modules, acs) => `---\ntype: Unit\ntitle: A\ndescription: A.\nintent: ${intentId}\nmodules: [${modules.join(', ')}]\nscope: ["${intentId}/${modules.join('-')}/**"]\n---\n\n# Acceptance criteria\n\n${acs.map((l, k) => `- AC-${k + 1} (${l}): x.`).join('\n')}\n`;
  const dir = project({
    'docs/intents/I-1-a.md': intent('I-1'),
    'docs/intents/I-2-b.md': intent('I-2'),
    'docs/intents/I-3-c.md': intent('I-3', 'slice: "a docs-only change"\n'),
    'docs/units/U-1-a.md': unit('I-1', ['api'], ['unit', 'integration']),
    'docs/units/U-2-b.md': unit('I-2', ['api'], ['unit']),
    'docs/units/U-3-c.md': unit('I-2', ['web'], ['e2e']),
    'docs/units/U-4-d.md': unit('I-3', ['api', 'web'], ['unit']),
  });
  const profile = { modules: [{ id: 'api', paths: ['api/**'] }, { id: 'web', paths: ['web/**'] }], levels: { unit: { run: 'u' }, integration: { run: 'i' }, e2e: { run: 'e' } } };
  const slices = (p) => lintPlan(join(dir, 'docs'), p, { base: dir }).filter((f) => f.code === 'PLAN-INCREMENT').map((f) => [f.path, f.message]);
  assert.deepEqual(slices(profile), [
    ['docs/intents/I-1-a.md', 'I-1 has no AC at the top level e2e: no bolt tests it end to end'],
    ['docs/units/U-4-d.md', 'U-4 crosses modules api, web but tests only at the unit level'],
  ], 'I-2 has an e2e AC; I-3 says why not');
  assert.deepEqual(slices({ ...profile, levels: { unit: { run: 'u' }, integration: { run: 'i' }, e2e: {} } }).map(([p]) => p), ['docs/intents/I-2-b.md', 'docs/units/U-4-d.md'], 'with no e2e run, integration is the top: I-1 has it, I-2 does not');
  assert.deepEqual(slices({ modules: profile.modules }), [['docs/units/U-4-d.md', 'U-4 crosses modules api, web but tests only at the unit level']], 'the defaults define no run: no intent check');
});

test('U76/AC-1 a slice waiver holds only for units outside every module and one-way door; approved units are not judged again', () => {
  const unit = (n, scope, fm = '') => `---\ntype: Unit\ntitle: A\ndescription: A.\nintent: I-1\nscope: ${JSON.stringify(scope)}\n${fm}---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n`;
  const dir = project({
    'docs/intents/I-1-a.md': '---\ntype: Intent\ntitle: I-1\ndescription: I-1.\nslice: "workflow only"\n---\n\n# Goal\nx\n',
    'docs/units/U-1-a.md': unit(1, ['.github/scripts/**', 'docs/notes/**']),
    'docs/units/U-2-b.md': unit(2, ['api/handler.go']),
    'docs/units/U-3-c.md': unit(3, ['migrations/0001.sql'], 'twoWay: "x"\n'),
    'docs/units/U-4-d.md': unit(4, ['api/old.go'], 'verified_hash: abc\n'),
  });
  const profile = { modules: [{ id: 'api', paths: ['api/**'] }], lanes: { full: ['migrations/**'] }, levels: { unit: { run: 'u' }, e2e: { run: 'e' } } };
  const slices = (p) => lintPlan(join(dir, 'docs'), p, { base: dir }).filter((f) => f.code === 'PLAN-INCREMENT').map((f) => [f.path, f.message]);
  assert.deepEqual(slices(profile), [
    ['docs/units/U-2-b.md', 'U-2 reaches the product (api/handler.go overlaps api/**), but I-1 skips its end-to-end test with endToEnd:'],
    ['docs/units/U-3-c.md', 'U-3 reaches the product (migrations/0001.sql overlaps migrations/**), but I-1 skips its end-to-end test with endToEnd:'],
  ], 'U-1 stays outside; U-4 is approved');
  assert.deepEqual(slices({ ...profile, levels: { unit: {} } }), [], 'no level runs: no slice check');
});

test('U50/AC-1 with deploy in the profile, a live intent links a Runbook doc', () => {
  const intent = (id, body = '') => `---\ntype: Intent\ntitle: ${id}\ndescription: ${id}.\n---\n\n# Goal\nx\n${body}`;
  const unit = (n, intentId) => `---\ntype: Unit\ntitle: A\ndescription: A.\nintent: ${intentId}\nscope: ["u${n}/**"]\n---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n`;
  const dir = project({
    'docs/intents/I-1-a.md': intent('I-1'),
    'docs/intents/I-2-b.md': intent('I-2', '\nRoll back with [the API runbook](../runbooks/api.md).\n'),
    'docs/intents/I-3-c.md': intent('I-3'),
    'docs/intents/I-4-d.md': intent('I-4', '\nSee [the design](../design/d.md).\n'),
    'docs/runbooks/api.md': '---\ntype: Runbook\ntitle: API\ndescription: The API runbook.\n---\n',
    'docs/design/d.md': '---\ntype: Design\ntitle: D\ndescription: D.\n---\n',
    'docs/units/U-1-a.md': unit(1, 'I-1'),
    'docs/units/U-2-b.md': unit(2, 'I-2'),
    'docs/units/U-3-c.md': unit(3, 'I-3'),
  });
  const runbooks = (profile, skip = []) => lintPlan(join(dir, 'docs'), profile, { base: dir, skip }).filter((f) => f.code === 'PLAN-RUNBOOK').map((f) => `${f.path} ${f.message}`);
  const deploy = { deploy: { check: ['make image'] } };
  assert.deepEqual(runbooks(deploy, ['U-3']), ['docs/intents/I-1-a.md I-1 links no runbook, and the profile deploys', 'docs/intents/I-4-d.md I-4 links no runbook, and the profile deploys'], 'I-2 links one; I-3 is merged; I-4 links no Runbook and has no units yet');
  assert.deepEqual(runbooks({}), [], 'no deploy, no runbook check');
  const template = readFileSync(join(ROOT, 'plugin/templates/docs/runbook.md'), 'utf8');
  for (const heading of ['# Roll back', '# Watch', '# Call']) assert.match(template, new RegExp(`^${heading}$`, 'm'));
  assert.match(template, /^type: Runbook$/m);
});

test('U91/AC-1 with deploy in the profile and no deploy.platform, each intent that ships fails PLAN-PLATFORM; [] passes', () => {
  const dir = project({
    'docs/intents/I-1-a.md': '---\ntype: Intent\ntitle: I-1\ndescription: I-1.\n---\n\n# Goal\nx\n',
    'docs/units/U-1-a.md': '---\ntype: Unit\ntitle: A\ndescription: A.\nintent: I-1\nscope: ["u1/**"]\n---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n',
  });
  const platform = (profile) => lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-PLATFORM').map((f) => `${f.path} ${f.message}`);
  assert.deepEqual(platform({ deploy: { check: ['make image'] } }), ['docs/intents/I-1-a.md I-1 ships, and the profile does not say where the deploy target is defined (deploy.platform)']);
  assert.deepEqual(platform({ deploy: { check: ['make image'], platform: [] } }), [], 'the project defines its own target');
  assert.deepEqual(platform({ deploy: { platform: ['../infra/README.md'] } }), []);
  assert.deepEqual(platform({}), [], 'no deploy, no platform check');
});

test('U89/AC-1 check on a unit file shows a slice finding on its intent, and approve refuses the unit until it is fixed', async () => {
  const { approve, commit, intentDoc, makeRepo, read, run, unitDoc, write } = await import('./state-repo.mjs');
  const U = 'docs/units/U-1-a.md';
  const dir = makeRepo({ 'docs/intents/I-1-a.md': intentDoc('I-1') }, { levels: { unit: { run: 'u' }, e2e: { run: 'e' } } });
  approve(dir, 'I-1'); // approved before its units, as in the first migration
  commit(dir, 'plan U-1', { [U]: unitDoc({ scope: ['src/**'], acs: ['- AC-1 (unit): adds.'] }) });
  const r = run(dir, ['check', U]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/intents\/I-1-a\.md:1 PLAN-INCREMENT I-1 has no AC at the top level e2e/);
  const refused = run(dir, ['approve', 'U-1']);
  assert.notEqual(refused.code, 0);
  assert.match(refused.err, /PLAN-INCREMENT I-1 has no AC at the top level e2e/);
  write(dir, { [U]: read(dir, U).replace('- AC-1 (unit): adds.', '- AC-1 (e2e): adds.') });
  assert.equal(run(dir, ['approve', 'U-1']).code, 0, 'an e2e AC clears it');
});

test('U107/AC-1 PLAN-SKELETON warns when the first top-level AC waits on more than half the product units', () => {
  const unit = (n, depends, level) => `---\ntype: Unit\ntitle: U${n}\ndescription: U${n}.\nintent: I-1\nscope: ["src/s${n}/**"]\ndepends: [${depends.join(', ')}]\n---\n\n# Acceptance criteria\n\n- AC-1 (${level}): x.\n`;
  const plan = (late) => project({
    'docs/intents/I-1-a.md': '---\ntype: Intent\ntitle: I-1\ndescription: I-1.\n---\n\n# Goal\nx\n',
    'docs/units/U-1-a.md': unit(1, [], 'unit'),
    'docs/units/U-2-b.md': unit(2, ['U-1'], 'unit'),
    'docs/units/U-3-c.md': unit(3, ['U-2'], 'unit'),
    'docs/units/U-4-d.md': unit(4, late ? ['U-3'] : ['U-1'], 'e2e'),
  });
  const profile = { modules: [{ id: 'app', paths: ['src/**'] }], levels: { unit: { run: 'u' }, e2e: { run: 'e' } } };
  const skeleton = (dir) => lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-SKELETON').map((f) => `${f.level} ${f.message}`);
  assert.deepEqual(skeleton(plan(true)), ["warning I-1's first e2e AC waits on 3 of its 4 product bolts: end to end comes last"]);
  assert.deepEqual(skeleton(plan(false)), [], 'a skeleton after U-1');
});

// U118, B152: bolts of an intent sit on increments proven end to end, never behind a later increment or a fix bolt.
const sliced = (lines, units, heading = 'Increments') => {
  const unit = (n, { depends = [], level = 'unit', intent = 'I-1', scope = `src/s${n}/**` }) => `---\ntype: Unit\ntitle: U${n}\ndescription: U${n}.\n${intent ? `intent: ${intent}\n` : ''}scope: ["${scope}"]\ndepends: [${depends.join(', ')}]\n---\n\n# Acceptance criteria\n\n- AC-1 (${level}): x.\n`;
  const files = { 'docs/intents/I-1-a.md': `---\ntype: Intent\ntitle: I-1\ndescription: I-1.\n---\n\n# Goal\nx\n${lines === null ? '' : `\n# ${heading}\n${lines}\n`}` };
  for (const [n, o] of Object.entries(units)) files[`docs/units/U-${n}-u.md`] = unit(n, o);
  const dir = project(files);
  const profile = { modules: [{ id: 'app', paths: ['src/**'] }], levels: { unit: { run: 'u' }, e2e: { run: 'e' } } };
  return lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-INCREMENT' || f.code === 'PLAN-SCOPE').map((f) => f.message);
};

test('B152/AC-1 PLAN-INCREMENT: each line opens with its id, every bolt on an increment proven end to end, none waiting on a later one', () => {
  const four = { 1: { level: 'e2e' }, 2: { depends: ['U-1'], level: 'e2e' }, 3: { depends: ['U-2'], level: 'e2e' }, 4: { depends: ['U-3'], level: 'e2e' } };
  assert.deepEqual(sliced(null, four), [], 'without the section an intent is one increment, of any size');
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1\n- I-1.2 Create: U-2', { 1: { level: 'e2e' }, 2: { depends: ['U-1'], level: 'e2e' } }), [], 'two increments');
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1', { 1: { level: 'e2e' }, 2: { depends: ['U-1'], level: 'e2e' } }), ["U-2 is on no increment line of I-1's # Increments"]);
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1\n- I-1.2 API: U-2', { 1: { level: 'e2e' }, 2: { depends: ['U-1'] } }), ['increment I-1.2 of I-1 (U-2) has no AC at the top level e2e: a layer, not an increment']);
  assert.deepEqual(sliced('- Skeleton: U-1\n- I-1.3 Create: U-2', { 1: { level: 'e2e' }, 2: { depends: ['U-1'], level: 'e2e' } }), [
    "line 11 of I-1's # Increments starts with Skeleton, not I-1.1: each increment line opens with its id, I-<n>.<k> in order",
    "line 12 of I-1's # Increments starts with I-1.3, not I-1.2: each increment line opens with its id, I-<n>.<k> in order",
  ]);
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1\n- I-1.2 Create: U-2', { 1: { level: 'e2e', depends: ['U-2'] }, 2: { level: 'e2e' } }), ['U-1 waits on U-2, a bolt of a later increment']);
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1\n- I-1.2 Later, not cut yet', { 1: { level: 'e2e' } }), [], "an uncut increment is next's to ask for");
});

test('B152/AC-2 a v1 intent keeps its # Slices: read as increments, with no ids asked of its lines', () => {
  assert.deepEqual(sliced('1. Skeleton: U-1\n2. Create: U-2', { 1: { level: 'e2e' }, 2: { depends: ['U-1'], level: 'e2e' } }, 'Slices'), []);
  assert.deepEqual(sliced('1. Skeleton: U-1\n2. API: U-2', { 1: { level: 'e2e' }, 2: { depends: ['U-1'] } }, 'Slices'), ['increment 2 of I-1 (U-2) has no AC at the top level e2e: a layer, not an increment']);
});

test('U131/AC-2 PLAN-INCREMENT reports a bolt on an increment that no end-to-end bolt of it needs', () => {
  const loose = (k) => `U-2 sits on increment ${k} with no e2e AC, and no bolt of that increment with one depends on it: give it a e2e AC, make the increment's end-to-end bolt depend on it, or move it to the increment that needs it`;
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1, U-2', { 1: { level: 'e2e' }, 2: { scope: 'b/**' } }), [loose('I-1.1')]);
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1, U-2', { 1: { level: 'e2e', depends: ['U-2'] }, 2: { scope: 'b/**' } }), [], 'U-1 needs it');
  assert.deepEqual(sliced(null, { 1: { level: 'e2e' }, 2: { scope: 'b/**' } }), [loose(1)], 'an intent without increment lines is one increment');
});

test('U118/AC-2 PLAN-INCREMENT reports a bolt of an intent waiting on a fix bolt not yet merged', () => {
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1', { 1: { level: 'e2e', depends: ['U-2'] }, 2: { intent: '', scope: 'go.mod' } }), ['U-1 waits on the fix bolt U-2: fix bolts build beside the increments, never ahead']);
});

test('U118/AC-3 PLAN-SCOPE asks for depends only between overlapping units of one intent', () => {
  assert.deepEqual(sliced('- I-1.1 Skeleton: U-1', { 1: { level: 'e2e', scope: 'src/**' }, 2: { intent: '', scope: 'src/go.mod' } }), [], 'a fix bolt beside the increment');
  assert.equal(sliced('- I-1.1 Skeleton: U-1\n- I-1.2 Create: U-2', { 1: { level: 'e2e', scope: 'src/**' }, 2: { level: 'e2e', scope: 'src/a/**' } }).length, 1, 'one intent still needs the path');
});
