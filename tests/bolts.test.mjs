// B153: work items are bolts B-<n> under bolts/; a v1 plan's units under units/ read as bolts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/config.mjs';
import { lintPlan, readPlan } from '../plugin/cli/lib/grid.mjs';
import { branchOf } from '../plugin/cli/lib/state.mjs';
import { I1, U, approve, intentDoc, makeRepo, read, run, unitDoc } from './state-repo.mjs';

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
