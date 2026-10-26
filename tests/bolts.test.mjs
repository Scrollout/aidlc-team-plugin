// B153: work items are bolts B-<n> under bolts/; a v1 plan's units under units/ read as bolts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/config.mjs';
import { lintPlan, readPlan } from '../plugin/cli/lib/grid.mjs';
import { branchOf } from '../plugin/cli/lib/state.mjs';
import { I1, U, approve, intentDoc, makeRepo, pinnedRepo, read, run, unitDoc } from './state-repo.mjs';

test('B153/AC-1 new bolt writes B-<n> under bolts/, numbered on from every unit and bolt, named from its title', () => {
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'] }) });
  const r = run(dir, ['new', 'bolt', "Register a provider's manifest through the ingress gateway with retries"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readdirSync(join(dir, 'docs/bolts')), ['B-3-register-a-providers-manifest-through-the.md'], 'no apostrophe, cut at a word, at most 48 characters');
  assert.match(read(dir, 'docs/bolts/B-3-register-a-providers-manifest-through-the.md'), /^type: Bolt\ntitle: "Register a provider's manifest through the ingress gateway with retries"\n/m);
  assert.match(r.out, /^wrote docs\/bolts\/B-3-register-a-providers-manifest-through-the\.md, a draft B-3/);
  assert.equal(run(dir, ['new', 'bolt', 'Second']).code, 0);
  assert.ok(existsSync(join(dir, 'docs/bolts/B-4-second.md')), 'the next number');
  assert.equal(run(dir, ['new', 'unit', 'x']).code, config.exit.usage, 'only bolts');
  assert.deepEqual(readPlan(join(dir, 'docs')).units.map((u) => u.id), ['U-1', 'U-2', 'B-3', 'B-4'], 'units and bolts read as one plan');
});

test('B153/AC-1 a bolt builds on bolt/B-<n> and is named in hooks and tags as B-<n>; a fix in a v2 project is a bolt', () => {
  assert.equal(branchOf('B-7'), 'bolt/B-7');
  assert.equal(branchOf('U-7'), 'unit/U-7', 'a v1 unit keeps its branch');
  assert.equal('review B-7 next'.match(new RegExp(config.hooks.unitPattern))?.[0], 'B-7');
  const dir = makeRepo(I1, { system: { core: ['src/**'] } });
  const r = run(dir, ['fix', 'Dependabot fails on main', '--scope', '.github/dependabot.yml']);
  assert.match(r.out, /^wrote docs\/bolts\/B-1-dependabot-fails-on-main\.md/m, r.err);
});

test('B153/AC-2 a v2 project refuses a new doc under units/; an approved v1 unit stays, and a v1 project is untouched', () => {
  const docs = { 'docs/intents/I-1-pricing.md': intentDoc('I-1'), [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'] }) };
  const dir = makeRepo(docs, { system: { core: ['src/**'] } });
  approve(dir, 'I-1', 'U-1');
  const legacy = (profile) => lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-BOLT').map((f) => [f.path, f.message]);
  assert.deepEqual(legacy({ system: { core: ['src/**'] } }), [['docs/units/U-2-u2.md', 'U-2 is new under units/: a v2 project writes its work items as bolts, aidlc new bolt "<title>"']]);
  assert.deepEqual(legacy({}), [], 'a v1 project keeps writing units until it migrates');
});

test('B154/AC-1 approving an intent pins it to the method it is approved under; a rule a later method added leaves an older intent alone', async () => {
  const { inForce, methodOf } = await import('../plugin/cli/lib/grid.mjs');
  const profile = { modules: [{ id: 'app', paths: ['src/**'] }], levels: { unit: { run: 'u' }, e2e: { run: 'e' } } };
  const unit = unitDoc({ scope: ['src/**'], acs: ['- AC-1 (e2e): it works.'] });
  const dir = makeRepo({ 'docs/intents/I-1-pricing.md': intentDoc('I-1') + '\n# Increments\n- I-1.1 Skeleton: U-1\n', [U(1)]: unit }, profile);
  approve(dir, 'I-1');
  assert.match(read(dir, 'docs/intents/I-1-pricing.md'), new RegExp(`^method: ${config.method.version}$`, 'm'));
  const ids = (fm) => {
    const d = makeRepo({ 'docs/intents/I-1-pricing.md': intentDoc('I-1').replace('---\n', `---\n${fm}`) + '\n# Increments\n- Skeleton: U-1\n', [U(1)]: unit }, profile);
    return lintPlan(join(d, 'docs'), profile, { base: d }).filter((f) => /opens with its id/.test(f.message)).length;
  };
  assert.equal(ids(''), 1, 'a draft is judged by the current method');
  assert.equal(ids(`verified_hash: abc\nmethod: ${config.method.version}\n`), 1, 'pinned to the current method, the rule holds');
  assert.equal(ids('verified_hash: abc\n'), 0, 'approved before pinning: method 1, which had no ids');
  assert.equal(methodOf({ fm: { verified_hash: 'abc' } }), 1);
  assert.equal(inForce({ fm: { verified_hash: 'abc' } }, 'planIncrementIntent'), true, 'a rule from method 1 holds for all');
});

test('B154/AC-2 upgrade lists the method changes it brings and says approved intents keep theirs', () => {
  const dir = pinnedRepo(I1);
  const cli = JSON.parse(read(dir, '.aidlc/bin/cli.json'));
  delete cli.method;
  writeFileSync(join(dir, '.aidlc/bin/cli.json'), JSON.stringify(cli));
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '0.0.1\n');
  const r = run(dir, ['upgrade', '--dirty']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`^Method 1 to ${config.method.version}: intents ship # Increments.*An intent approved before keeps method 1's rules; one approved from now on is judged by method ${config.method.version}\\.$`, 'm'));
  assert.doesNotMatch(run(dir, ['upgrade', '--dirty']).out, /^Method /m, 'nothing new the second time');
});
