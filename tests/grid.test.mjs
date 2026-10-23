import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeLane, inside, lintPlan, overlaps, readPlan } from '../plugin/cli/lib/grid.mjs';
import { tempDir } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const PLAN = join(ROOT, 'tests/fixtures/plan');
const CLI = join(ROOT, 'plugin/cli/aidlc.mjs');
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

  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  mkdirSync(join(dir, 'migrations'));
  writeFileSync(join(dir, 'migrations/0001_init.sql'), 'select 1;\n');
  git('add', '.');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'change');
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
    'docs/units/U-1-a.md': unitDoc('scope: ["build/**"]', '- AC-1 (unit): x.'),
    'docs/units/U-2-b.md': unitDoc('scope: ["Makefile"]', '- AC-1 (unit): x.'),
    'docs/units/U-3-c.md': unitDoc('depends: [U-1]\nscope: ["go.mod"]', '- AC-1 (unit): x.'),
    'docs/units/U-4-d.md': unitDoc('depends: [U-1]\nscope: ["go.mod"]', '- AC-1 (unit): x.'),
    'docs/units/U-5-e.md': unitDoc('scope: ["/README.md"]', '- AC-1 (unit): x.'),
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
  const found = lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code !== 'PLAN-SLICE'); // U43 has its own test
  assert.deepEqual(found.map((f) => [f.code, f.path, f.message]), [
    ['PLAN-MODULE', 'docs/units/U-2-b.md', 'U-2 names module web, which profile.modules lacks (has: api, sdk-ts)'],
    ['PLAN-TEST', 'docs/units/U-2-b.md', 'AC-1 (unit) has no test location: no scope glob overlaps levels.unit.paths tests/unit/**'],
  ], 'U-1 adds its test location to the profile with its test; a module keyed by name counts');
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
    ['docs/units/U-1-a.md', 'U-1 touches the one-way door migrations/** and links no decision'],
    ['docs/units/U-4-d.md', 'U-4 touches the one-way door docs/architecture/api.md and links no decision'],
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
  });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  const profile = { generated: [{ outputs: ['api/openapi/*.yaml', 'web/schema.d.ts'], sources: ['api/tsp/**'] }] };
  const found = lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-GENERATED').map((f) => [f.path, f.message]);
  assert.deepEqual(found, [
    ['docs/units/U-1-a.md', 'U-1 scope names api/openapi/*.yaml but not api/tsp/**: a generator links them'],
    ['docs/units/U-2-b.md', 'U-2 scope names api/tsp/** but not api/openapi/*.yaml, web/schema.d.ts: a generator links them'],
    ['docs/units/U-4-d.md', 'U-4 scope names sdk/schema.d.ts, which exists but git does not track: a builder cannot commit it'],
  ], 'both sides pass; a new file passes');
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
  const slices = (p) => lintPlan(join(dir, 'docs'), p, { base: dir }).filter((f) => f.code === 'PLAN-SLICE').map((f) => [f.path, f.message]);
  assert.deepEqual(slices(profile), [
    ['docs/intents/I-1-a.md', 'I-1 has no AC at the top level e2e: no unit tests it end to end'],
    ['docs/units/U-4-d.md', 'U-4 crosses modules api, web but tests only at the unit level'],
  ], 'I-2 has an e2e AC; I-3 says why not');
  assert.deepEqual(slices({ ...profile, levels: { unit: { run: 'u' }, integration: { run: 'i' }, e2e: {} } }).map(([p]) => p), ['docs/intents/I-2-b.md', 'docs/units/U-4-d.md'], 'with no e2e run, integration is the top: I-1 has it, I-2 does not');
  assert.deepEqual(slices({ modules: profile.modules }), [['docs/units/U-4-d.md', 'U-4 crosses modules api, web but tests only at the unit level']], 'the defaults define no run: no intent check');
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
