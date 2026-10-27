// B153: work items are bolts B-<n> under bolts/; a v1 plan's units under units/ read as bolts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, lintPlan, readPlan, branchOf } from '../plugin/cli/lib/index.mjs';
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
  const docs = { 'docs/intents/I-1-pricing.md': intentDoc('I-1').replace('type: Intent\n', 'type: Intent\npathway: feature\nmethod: 5\n'), [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'] }) };
  const dir = makeRepo(docs, { system: { core: ['src/**'] } });
  approve(dir, 'I-1', 'U-1');
  const legacy = (profile) => lintPlan(join(dir, 'docs'), profile, { base: dir }).filter((f) => f.code === 'PLAN-BOLT').map((f) => [f.path, f.message]);
  assert.deepEqual(legacy({ system: { core: ['src/**'] } }), [['docs/units/U-2-u2.md', 'U-2 is new under units/: a v2 project writes its work items as bolts, aidlc new bolt "<title>"']]);
  assert.deepEqual(legacy({}), [], 'a v1 project keeps writing units until it migrates');
});

test('B154/AC-1 approving an intent pins it to the method it is approved under; a rule a later method added leaves an older intent alone', async () => {
  const { inForce, methodOf } = await import('../plugin/cli/lib/index.mjs');
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
  const { docSlug } = await import('../plugin/cli/lib/index.mjs');
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
  const { registry } = await import('../plugin/cli/lib/index.mjs');
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

test('B161/AC-1 aidlc name prints each kind from the grammar and the registry, and refuses an unregistered token or a missing flag', () => {
  const naming = { tokens: { system: 'rsm', org: 'acme', zone: 'example.internal', registry: 'ghcr.io' }, domains: { providers: {}, roleassignments: { name: 'Role assignments' } } };
  const dir = makeRepo(I1, { naming });
  const name = (...args) => run(dir, ['name', ...args]);
  const cases = [
    [['slice', '--domain', 'providers', '--verb', 'register'], 'registerprovider'],
    [['operation-id', '--domain', 'roleassignments', '--verb', 'create'], 'RoleAssignments_CreateOrUpdate'],
    [['path', '--domain', 'roleassignments'], '/providers/Acme.Rsm/roleAssignments/{roleAssignmentName}'],
    [['permission', '--domain', 'providers', '--action', 'write'], 'Acme.Rsm/providers/write'],
    [['event', '--domain', 'providers', '--verb', 'register'], 'Acme.Rsm.ProviderRegistered'],
    [['deployable', '--stage', 'ingress', '--role', 'gateway'], 'rsm-ingress-gateway'],
    [['image', '--domain', 'providers', '--role', 'api', '--tag', '1.4.0'], 'ghcr.io/acme/rsm-providers-api:1.4.0'],
    [['k8s-namespace', '--env', 'dev'], 'rsm-dev'],
    [['migration', '--domain', 'providers', '--number', '1', '--verb', 'create', '--object', 'resource types'], 'migrations/providers/0001_create_resource_types.sql'],
    [['db-role', '--domain', 'providers'], 'rsm_providers'],
    [['api-version', '--date', '2026-10-27', '--preview'], '2026-10-27-preview'],
  ];
  for (const [args, want] of cases) assert.equal(name(...args).out, `${want}\n`, args.join(' '));
  assert.match(name('domain', '--domain', 'frontdoor').err, /domain frontdoor is not in the registry .*registered: providers, roleassignments/);
  assert.match(name('deployable', '--domain', 'providers', '--role', 'manager').err, /role manager is not in the registry/);
  assert.match(name('deployable', '--domain', 'providers').err, /deployable needs role: --role/);
  assert.match(run(makeRepo(I1, {}), ['name', 'k8s-namespace', '--env', 'dev']).err, /needs system: naming\.tokens\.system/);
  assert.match(name('nonsense').err, /^name: usage: aidlc name <kind>; kinds: domain, slice/);
});

test('B162/AC-1 the registry generates the gate rules for migrations, images, namespaces and banned segments, and holds each module id', async () => {
  const { generatedRules } = await import('../plugin/cli/lib/index.mjs');
  const naming = { tokens: { system: 'rsm', org: 'acme', registry: 'ghcr.io' }, domains: { providers: {} } };
  const rules = Object.fromEntries(generatedRules({ naming }).map((r) => [r.id, r]));
  const full = (id, s) => new RegExp(`^(?:${rules[id].pattern})$`).test(s);
  assert.ok(full('migration', 'migrations/providers/0001_create_resource_types.sql'));
  assert.ok(!full('migration', 'migrations/registry/0001_init.sql'), 'an unregistered domain');
  assert.ok(full('image', 'ghcr.io/acme/rsm-providers-api:1.4.0') && full('image', 'ghcr.io/acme/rsm-ingress-gateway:sha-abc'));
  assert.ok(!full('image', 'ghcr.io/acme/resource-manager-frontdoor:sha-abc'), 'an invented name');
  assert.ok(full('namespace', 'rsm-dev') && !full('namespace', 'resource-manager-dev'));
  assert.ok(full('banned', 'internal/domains/providers/model/provider.go'));
  for (const bad of ['internal/store/x.go', 'pkg/utils.go', 'internal/frontdoor/app/a.go']) assert.ok(!full('banned', bad), bad);
  assert.deepEqual(generatedRules({}), [], 'no registry, no generated rule');
  const modules = [{ id: 'providers', kind: 'domain', paths: ['a/**'] }, { id: 'registry', kind: 'domain', paths: ['b/**'] }, { id: 'store', kind: 'foundation', paths: ['c/**'] }, { id: 'ingress', kind: 'pipeline', paths: ['d/**'] }];
  const lines = run(makeRepo(I1, { naming, modules }), ['check']).out.split('\n').filter((l) => /PROFILE-NAMING module/.test(l)).map((l) => l.replace(/^\S+ PROFILE-NAMING /, '').replace(/ → .*$/, ''));
  assert.deepEqual(lines, ['module registry is a domain, and registry is not in naming.domains or a domain doc', 'module store is a foundation, and store is not in naming.vocabularies.foundation']);
  assert.match(run(makeRepo(I1, { system: { core: ['src/**'] } }), ['check']).out, /PROFILE-NAMING a v2 profile \(it has system\) needs naming\.tokens\.system/);
});

test('B163/AC-1 the domains glossaries generate naming/glossary.md, written by the CLI with its digest', () => {
  const orders = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Glossary\n- **order** (not: purchase, basket): what a buyer asks for\n- **line**: one product and its quantity on an order\n- **<term>**: <placeholder from the template>\n';
  const dir = makeRepo({ ...I1, 'docs/domains/orders.md': orders });
  assert.equal(run(dir, ['map']).code, 0);
  const page = read(dir, 'docs/naming/glossary.md');
  assert.match(page, /^type: Glossary\n[\s\S]*^generated: \{ by: aidlc\/[^,]+, at: [^,]+, digest: [0-9a-f]{16} \}$/m);
  assert.match(page, /^\| \*\*order\*\* \| orders \| purchase, basket \| what a buyer asks for \|\n\| \*\*line\*\* \| orders \| - \| one product and its quantity on an order \|$/m);
  assert.doesNotMatch(page, /placeholder/, 'template placeholders are no terms');
  assert.doesNotMatch(run(dir, ['check']).out, /DOC-GENERATED|DOC-SCHEMA docs\/naming/, 'a generated doc in its folder');
});

test('B164/AC-1 the card prints the names a bolt will create for each registered domain it names, from the grammar', () => {
  const naming = { tokens: { system: 'rsm', org: 'acme' }, domains: { providers: {} } };
  const modules = [{ id: 'providers', kind: 'domain', paths: ['src/providers/**'] }, { id: 'db', kind: 'foundation', paths: ['lib/db/**'] }];
  const dir = makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['src/providers/**'], modules: ['providers', 'db'], acs: ['- AC-1 (integration): it works.'] }) }, { naming: { ...naming, vocabularies: { foundation: ['db'] } }, modules });
  approve(dir, 'I-1', 'U-1');
  const card = run(dir, ['card', 'U-1']).out;
  assert.match(card, /^- names this bolt creates for providers \(aidlc name\): schema providers, database role rsm_providers, path \/providers\/Acme\.Rsm\/providers\/\{providerName\}, write permission Acme\.Rsm\/providers\/write, created event Acme\.Rsm\.ProviderCreated$/m);
  assert.doesNotMatch(card, /names this bolt creates for db/, 'only domains');
});

test('B165/AC-1 CONTRACT-NAME checks a published OpenAPI document against the API grammar', async () => {
  const { contractProblems } = await import('../plugin/cli/extensions/contracts/index.mjs');
  // The control-plane model's contract on top of the generic grammar, as a project that chose it gets (decision 0021).
  const plane = { ...config.naming.contract, ...JSON.parse(read(join(import.meta.dirname, '..'), 'plugin/cli/models/control-plane/model.json')).contract };
  const keys = (doc, C = plane) => contractProblems(doc, C).map(([k, d]) => `${k} ${Object.values(d).join(' ')}`);
  const good = {
    info: { version: '2026-10-27' },
    paths: { '/providers/Acme.Rsm/roleAssignments/{roleAssignmentName}': { put: { operationId: 'RoleAssignments_CreateOrUpdate' }, get: { operationId: 'RoleAssignments_Get' } } },
    components: { schemas: {
      RoleAssignment: { properties: { id: { type: 'string' }, name: {}, type: {}, systemData: {}, properties: {}, enabled: { type: 'boolean' } } },
      RoleAssignmentList: { properties: { value: { type: 'array' }, nextLink: { type: 'string' } } },
      State: { type: 'string', enum: ['Succeeded', 'Failed', 'Canceled'] },
    } },
  };
  assert.deepEqual(keys(good), []);
  const bad = {
    info: { version: 'v1' },
    paths: { '/providers/acme/role_assignments/{name}/x': { put: { operationId: 'roleAssignments_get' } } },
    components: { schemas: { R: { properties: { id: {}, name: {}, type: {}, Display_Name: {}, isEnabled: { type: 'boolean' } } }, L: { properties: { value: { type: 'array' } } }, S: { type: 'string', enum: ['succeeded'] } } },
  };
  assert.deepEqual(keys(bad), [
    'contractVersion v1',
    'contractSegment /providers/acme/role_assignments/{name}/x acme a PascalCase dotted namespace, Org.Service',
    'contractSegment /providers/acme/role_assignments/{name}/x role_assignments camelCase',
    'contractParam /providers/acme/role_assignments/{name}/x name',
    'contractPut /providers/acme/role_assignments/{name}/x',
    'contractOperationId /providers/acme/role_assignments/{name}/x put roleAssignments_get',
    'contractProperty components.schemas.R Display_Name',
    'contractBoolean components.schemas.R isEnabled',
    'contractSystemData components.schemas.R systemData',
    'contractNextLink components.schemas.L nextLink',
    'contractEnum components.schemas.S succeeded',
  ]);
  assert.deepEqual(keys(bad, config.naming.contract).filter((k) => /dotted namespace|SystemData|NextLink/.test(k)), [], 'B232/AC-2 without the model, none of its contract applies');
});

test('B165/AC-1 check reports CONTRACT-NAME on the documents under api/ once the profile has a naming registry', () => {
  const spec = 'openapi: 3.1.0\ninfo:\n  title: x\n  version: v1\npaths:\n  /providers/{namespace}:\n    get:\n      operationId: Providers_get\n';
  const found = (profile) => run(makeRepo({ ...I1, 'api/frontdoor/openapi.yaml': spec }, profile), ['check']).out.split('\n').filter((l) => /CONTRACT-NAME/.test(l)).map((l) => l.replace(/ → .*$/, ''));
  assert.deepEqual(found({}), [], 'no registry, no contract check');
  assert.deepEqual(found({ naming: { tokens: { system: 'rsm' } } }), [
    'api/frontdoor/openapi.yaml:1 CONTRACT-NAME info.version v1 is no api-version (YYYY-MM-DD or YYYY-MM-DD-preview)',
    'api/frontdoor/openapi.yaml:1 CONTRACT-NAME /providers/{namespace}: parameter namespace is not a full lowerCamel name ending in Name or Id',
    'api/frontdoor/openapi.yaml:1 CONTRACT-NAME /providers/{namespace} get: operationId Providers_get is not Noun_Verb',
  ]);
});
