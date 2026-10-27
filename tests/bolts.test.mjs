// B153: work items are bolts B-<n> under bolts/; a v1 plan's units under units/ read as bolts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../plugin/cli/lib/config.mjs';
import { lintPlan, readPlan } from '../plugin/cli/lib/grid.mjs';
import { branchOf } from '../plugin/cli/lib/state.mjs';
import { I1, U, approve, git, intentDoc, makeRepo, pinnedRepo, read, run, unitDoc } from './state-repo.mjs';

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

test('B156/AC-2 each v2 type carries the keys its schema requires, with allowed values, in its folder', () => {
  const domain = (fm) => `---\ntype: Domain\ntitle: Providers\ndescription: Providers.\ngenerated: { by: x/1, at: 2026-10-27T00:00:00Z }\n${fm}---\n\n# Glossary\nx\n`;
  const docs = {
    'docs/domains/providers.md': domain('code: providers\nkind: domain\n'),
    'docs/domains/quotas.md': domain('code: quotas\nkind: library\n'),
    'docs/domains/scopes.md': domain(''),
    'docs/notes/access.md': domain('code: access\nkind: domain\n'),
  };
  const found = (profile) => run(makeRepo(docs, profile), ['check']).out.split('\n').filter((l) => /DOC-SCHEMA/.test(l)).map((l) => l.replace(/ → .*$/, ''));
  assert.deepEqual(found({}), [
    "docs/domains/quotas.md:1 DOC-SCHEMA a Domain's kind is library, not one of domain, pipeline, foundation, adapter, runtime, extension, delivery",
    'docs/domains/scopes.md:1 DOC-SCHEMA a Domain lacks code',
    'docs/domains/scopes.md:1 DOC-SCHEMA a Domain lacks kind',
  ], 'a v1 bundle: keys and values only');
  assert.ok(found({ system: { core: ['src/**'] } }).includes('docs/notes/access.md:1 DOC-SCHEMA a Domain lives in domains/, not notes/'), 'a v2 bundle: folders too');
});

test('B156/AC-3 a generated doc carries its body digest: a hand edit, or one written by anyone but the CLI, is DOC-GENERATED', () => {
  const modules = [{ id: 'orders', kind: 'domain', paths: ['src/orders/**'] }];
  const dir = makeRepo({ 'src/orders/a.mjs': '1;\n' }, { system: { core: ['src/**'] }, modules });
  assert.equal(run(dir, ['map']).code, 0);
  const file = 'docs/architecture/codebase-map.md';
  assert.match(read(dir, file), /^generated: \{ by: aidlc\/[^,]+, at: [^,]+, digest: [0-9a-f]{16} \}$/m, 'a v2 map lives in architecture/, with its digest');
  const generated = () => run(dir, ['check']).out.split('\n').filter((l) => /DOC-GENERATED/.test(l)).map((l) => l.replace(/ → .*$/, ''));
  assert.deepEqual(generated(), []);
  writeFileSync(join(dir, file), read(dir, file).replace('# Tree', '# Tree, tidied'));
  assert.deepEqual(generated(), [`${file}:1 DOC-GENERATED this Map is written only by the CLI, and its body no longer matches its digest: it was edited by hand`]);
  writeFileSync(join(dir, file), read(dir, file).replace(/by: aidlc\/[^,]+/, 'by: claude-code/x'));
  assert.deepEqual(generated(), [`${file}:1 DOC-GENERATED this Map is written only by the CLI, not by claude-code/x`]);
  assert.equal(run(dir, ['map']).code, 0);
  assert.deepEqual(generated(), [], 'the CLI writes it again');
});

test('B157/AC-1 a doc named by an id carries the slug of its title: lower case, no apostrophes, at most 48 characters, cut at a word', async () => {
  const { docSlug } = await import('../plugin/cli/lib/okf.mjs');
  assert.equal(docSlug("Dependabot's docker update fails on main"), 'dependabots-docker-update-fails-on-main');
  assert.equal(docSlug('The CLI budget is 5,000 lines'), 'the-cli-budget-is-5000-lines');
  assert.equal(docSlug('Contract specs compiled from TypeSpec with generated Go'), 'contract-specs-compiled-from-typespec-with');
  const unit = (title) => unitDoc({ title, scope: ['src/**'] });
  const docs = { 'docs/units/U-4-dependabot-s-docker-update-fails-on-main.md': unit("Dependabot's docker update fails on main"), 'docs/units/U-5-contract-specs-compiled-from-typespec-wi.md': unit('Contract specs compiled from TypeSpec with generated Go'), 'docs/units/U-6-clean.md': unit('Clean') };
  const slugs = (profile) => run(makeRepo(docs, profile), ['check']).out.split('\n').filter((l) => /DOC-SLUG/.test(l)).map((l) => l.replace(/ → .*( \((?:warning|error)\))$/, '$1'));
  assert.deepEqual(slugs({}), [
    'docs/units/U-4-dependabot-s-docker-update-fails-on-main.md:1 DOC-SLUG U-4-dependabot-s-docker-update-fails-on-main.md is not named from its title: U-4-dependabots-docker-update-fails-on-main.md (warning)',
    'docs/units/U-5-contract-specs-compiled-from-typespec-wi.md:1 DOC-SLUG U-5-contract-specs-compiled-from-typespec-wi.md is not named from its title: U-5-contract-specs-compiled-from-typespec-with.md (warning)',
  ], 'a v1 bundle: warnings');
  assert.ok(slugs({ system: { core: ['src/**'] } }).every((l) => l.endsWith('(error)')), 'a v2 bundle: errors');
});

test('B160/AC-1 the profile naming registry is checked: tokens by their rule, domains and vocabulary words as lower-case words, none banned', async () => {
  const { registry } = await import('../plugin/cli/lib/naming.mjs');
  const naming = (n) => run(makeRepo(I1, { naming: n }), ['check']).out.split('\n').filter((l) => /PROFILE-NAMING/.test(l)).map((l) => l.replace(/^\S+ PROFILE-NAMING /, '').replace(/ → .*$/, ''));
  assert.deepEqual(naming({ tokens: { system: 'rsm', org: 'acme', zone: 'example.internal' }, domains: { providers: {} }, vocabularies: { role: ['api'] } }), []);
  assert.deepEqual(naming({ tokens: { system: 'ResourceManager', org: 'Acme Inc', zone: 'localhost' }, domains: { Providers: {}, store: {} }, vocabularies: { role: ['api-gw', 'manager'] } }), [
    'naming.tokens.system is ResourceManager, not 2-6 lower-case letters or digits',
    'naming.tokens.org is Acme Inc, not a DNS label',
    'naming.tokens.zone is localhost, not a DNS name',
    'naming domain Providers is not a lower-case word (the plural noun of its root aggregate)',
    'naming domain store is a banned word',
    'naming vocabulary role holds api-gw, not a lower-case word',
    'naming vocabulary role manager is a banned word',
  ]);
  const dir = makeRepo({ 'docs/domains/quotas.md': '---\ntype: Domain\ntitle: Quotas\ndescription: Quotas.\ncode: quotas\nkind: domain\n---\n' }, { naming: { domains: { providers: {} } } });
  const reg = registry({ naming: { domains: { providers: {} }, banned: ['thingy'] } }, join(dir, 'docs'));
  assert.deepEqual(Object.keys(reg.domains).sort(), ['providers', 'quotas'], 'a domain doc registers its code');
  assert.ok(reg.banned.includes('manager') && reg.banned.includes('thingy'), 'the project adds to the default list');
  assert.ok(reg.vocabularies.pipeline.includes('ingress'), 'the defaults fill what the profile leaves out');
});

test('B160/AC-2 init takes the system code, org and zone into the profile naming tokens', () => {
  const dir = makeRepo({});
  git(dir, 'rm', '-q', '.aidlc/profile.json');
  const r = run(dir, ['init', '--name', 'p', '--base', 'main', '--bundle', 'docs', '--system-code', 'rsm', '--org', 'acme', '--zone', 'example.internal']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(read(dir, '.aidlc/profile.json')).naming, { tokens: { system: 'rsm', org: 'acme', zone: 'example.internal' } });
});
