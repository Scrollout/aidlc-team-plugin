// M27 B245: vertical slices across a domain's horizontal layers, checked from the pack's graph, the folders, the
// domain doc and the tests (docs/design/vertical-slices.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { msg, seam } from '../plugin/cli/lib/index.mjs';
import '../plugin/cli/extensions/intake/index.mjs'; // its stories seam, as the CLI loads every extension
import { sliceFindings } from '../plugin/cli/extensions/stacks/index.mjs';
import { graphFindings, testFindings } from '../plugin/cli/extensions/slices/index.mjs';
import '../plugin/cli/extensions/models/index.mjs'; // the chosen model's layers, for SLICE-GOVERN
import { makeRepo, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const NOTES = { system: { core: ['internal/**', 'cmd/**'] }, modules: [{ id: 'notes', kind: 'domain', paths: ['internal/domains/notes/**'] }, { id: 'notes-api', kind: 'runtime', paths: ['cmd/notes-api/**'] }] };
const lines = (fs) => fs.map((f) => `${f.code} ${f.path} ${f.key}`).sort();
const go = (pkg, imports = []) => `package ${pkg}\n\nimport (\n${imports.map((i) => `\t"example.com/shop/${i}"`).join('\n')}\n)\n`;
const D = 'internal/domains/orders';
const ORDERS = { system: { core: ['internal/**', 'cmd/**'] }, modules: [{ id: 'orders', kind: 'domain', paths: [`${D}/**`] }, { id: 'shop-api', kind: 'runtime', paths: ['cmd/shop-api/**'] }] };
const intent = '---\ntype: Intent\ntitle: Orders\ndescription: Orders.\npathway: feature\nmethod: 12\n---\n\n# Stories\n- US1.1 As a customer, I want to order, so that I get a cake. [Q-1.1]\n';

test('B245/AC-1 the pack\'s reference keeps its slices apart, entered from its interface layer, each placed and tested', () => {
  const dir = makeRepo({}, NOTES);
  cpSync(join(ROOT, 'plugin/packs/go/reference'), dir, { recursive: true });
  assert.deepEqual(lines(sliceFindings(dir, NOTES)), []);
});

test('B245/AC-1 a slice importing a slice, a slice entered sideways or from nowhere, a file outside the layers, an empty folder', () => {
  const dir = makeRepo({
    'go.mod': 'module example.com/shop\n\ngo 1.22\n',
    [`${D}/application/placeorder/handler.go`]: go('placeorder', [`${D}/application/listorders`, `${D}/model`]),
    [`${D}/application/placeorder/handler_test.go`]: 'package placeorder\n',
    [`${D}/application/listorders/handler.go`]: go('listorders', [`${D}/model`]),
    [`${D}/application/cancelorder/handler.go`]: go('cancelorder'),
    [`${D}/application/helpers.go`]: go('application'),
    [`${D}/model/order.go`]: go('model'),
    [`${D}/infrastructure/store.go`]: go('infrastructure', [`${D}/application/listorders`]),
    [`${D}/interface/http.go`]: go('iface', [`${D}/application/placeorder`]),
    [`${D}/utils/strings.go`]: go('utils'),
    [`${D}/events/.keep`]: '',
    'cmd/shop-api/main.go': go('main', [`${D}/interface`]),
  }, ORDERS);
  assert.deepEqual(lines(sliceFindings(dir, ORDERS)), [
    `SLICE-ENTRY ${D}/application/cancelorder sliceUnreached`,
    `SLICE-ENTRY ${D}/application/listorders sliceUnreached`,
    `SLICE-ENTRY ${D}/infrastructure sliceEntry`,
    `SLICE-IMPORT ${D}/application/placeorder sliceImport`,
    `SLICE-PLACE ${D}/application/helpers.go sliceLoose`,
    `SLICE-PLACE ${D}/utils/strings.go slicePlace`,
    `SLICE-TEST ${D}/application/cancelorder sliceTest`,
    `SLICE-TEST ${D}/application/listorders sliceTest`,
  ]);
});

test('B245/AC-2 the slice folders equal the domain doc\'s commands and queries, each with its use case and stories; the gate counts only what a bolt changed', () => {
  const doc = (surface) => `---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n${surface}\n`;
  const files = (surface) => ({
    'go.mod': 'module example.com/shop\n\ngo 1.22\n',
    [`${D}/application/placeorder/handler.go`]: go('placeorder', [`${D}/model`]), [`${D}/application/placeorder/handler_test.go`]: 'package placeorder\n',
    [`${D}/model/order.go`]: go('model'), [`${D}/interface/http.go`]: go('iface', [`${D}/application/placeorder`]),
    'docs/intents/I-1-orders.md': intent, 'docs/domains/orders.md': doc(surface),
  });
  const found = (surface) => lines(sliceFindings(makeRepo(files(surface), ORDERS), ORDERS));
  assert.deepEqual(found('- Command placeorder: a customer orders a cake [I-1:US1.1]'), [], 'listed, with its use case and story');
  assert.deepEqual(found('- Command placeorder: [I-1:US1.9]\n- Query listorders: a customer sees their orders'), [
    'SLICE-STORY docs/domains/orders.md sliceBadStory', 'SLICE-STORY docs/domains/orders.md sliceNoStory',
    'SLICE-SURFACE docs/domains/orders.md sliceSurface', 'SLICE-SURFACE docs/domains/orders.md sliceUseCase',
  ]);
  // An approved intent's story in a unit of work that changes the domain is owed a slice.
  const approved = intent.replace('pathway: feature\n', 'pathway: feature\nmethod: 11\nverified: [{ by: "human:owner@example.com", at: 2026-10-27T00:00:00Z }]\n')
    + '- US1.2 As a customer, I want to cancel, so that a wrong order costs nothing. [Q-1.1]\n\n# Units\n## orders\n- Modules: orders\n- Stories: US1.1, US1.2\n';
  assert.deepEqual(lines(sliceFindings(makeRepo({ ...files('- Command placeorder: a customer orders a cake [I-1:US1.1]'), 'docs/intents/I-1-orders.md': approved }, ORDERS), ORDERS)), ['SLICE-STORY docs/domains/orders.md sliceUncovered']);
  const dir = makeRepo(files('- Command placeorder: [I-1:US1.1]'), ORDERS);
  const gate = (paths) => seam('gateChecks', ORDERS).flatMap((check) => check(dir, ORDERS, paths)).filter((f) => f.code.startsWith('SLICE-'));
  assert.deepEqual(gate([`${D}/model/order.go`]), [], 'existing debt is not the bolt\'s');
  assert.deepEqual(lines(gate(['docs/domains/orders.md'])), ['SLICE-SURFACE docs/domains/orders.md sliceUseCase'], 'a bolt that changes the doc answers for it');
});

// B246: with a naming registry, slices named and routed by it, and a new slice delivered whole.
const NAMED = { ...ORDERS, naming: { tokens: { system: 'shop', org: 'acme' }, domains: { orders: {} } } };
const shop = (extra = {}) => ({
  'go.mod': 'module example.com/shop\n\ngo 1.22\n',
  [`${D}/application/createorder/handler.go`]: go('createorder', [`${D}/model`]), [`${D}/application/createorder/handler_test.go`]: 'package createorder\n',
  [`${D}/model/order.go`]: go('model'), [`${D}/interface/http.go`]: go('iface', [`${D}/application/createorder`]),
  ...extra,
});
const api = (ops) => `openapi: 3.1.0\ninfo: { title: Orders, version: 2026-10-01 }\npaths:\n${ops.map(([path, method, id]) => `  ${path}:\n    ${method}:\n      operationId: ${id}\n`).join('')}`;

test('B246/AC-1 a slice is a name the registry composes, and each operation id maps once to the slice of its domain and verb', () => {
  assert.deepEqual(lines(sliceFindings(makeRepo(shop({ 'api/orders/openapi.yaml': api([['/orders/{orderName}', 'put', 'Orders_CreateOrUpdate']]) }), NAMED), NAMED)), [], 'named and routed');
  const dir = makeRepo(shop({
    [`${D}/application/placeorder/handler.go`]: go('placeorder', [`${D}/model`]), [`${D}/application/placeorder/handler_test.go`]: 'package placeorder\n',
    [`${D}/interface/http.go`]: go('iface', [`${D}/application/createorder`, `${D}/application/placeorder`]),
    'api/orders/openapi.yaml': api([['/orders/{orderName}', 'put', 'Orders_CreateOrUpdate'], ['/orders/{orderName}/copy', 'put', 'Orders_CreateOrUpdate'], ['/orders', 'get', 'Orders_List'], ['/orders/{orderName}/bake', 'post', 'Orders_Bake']]),
  }), NAMED);
  assert.deepEqual(lines(sliceFindings(dir, NAMED)), [
    `SLICE-NAME ${D}/application/placeorder sliceName`,
    'SLICE-ROUTE api/orders/openapi.yaml sliceRouteNone',
    'SLICE-ROUTE api/orders/openapi.yaml sliceRouteTwice',
    'SLICE-ROUTE api/orders/openapi.yaml sliceRouteUnknown',
    `SLICE-ROUTE ${D}/application/placeorder sliceNoRoute`,
  ]);
});

test('B246/AC-2 a bolt that adds a slice also wires its route and lists it in the domain doc', () => {
  const dir = makeRepo(shop(), NAMED);
  const slice = { [`${D}/application/getorder/handler.go`]: go('getorder', [`${D}/model`]), [`${D}/application/getorder/handler_test.go`]: 'package getorder\n' };
  write(dir, slice);
  const gate = (paths) => lines(seam('gateChecks', NAMED).flatMap((check) => check(dir, NAMED, paths)).filter((f) => f.code === 'SLICE-DELIVER'));
  assert.deepEqual(gate(Object.keys(slice)), [`SLICE-DELIVER ${D}/application/getorder sliceDeliverRoute`, `SLICE-DELIVER ${D}/application/getorder sliceDeliverDoc`].sort());
  assert.deepEqual(gate([...Object.keys(slice), `${D}/interface/http.go`, 'docs/domains/orders.md']), [], 'delivered whole');
  assert.deepEqual(gate([`${D}/application/createorder/handler.go`]), [], 'a slice the base holds is no new slice');
});

// M28 B249: the slices a bolt delivers, held to its domain doc and to its diff.
test('B249/AC-1 a bolt\'s slices are on its bound domain\'s surface, a horizontal bolt lists none, and each listed slice\'s folder changes', async () => {
  const { run } = await import('./state-repo.mjs');
  const doc = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder: a customer orders a cake [I-1:US1.1]\n';
  const boltDoc = (modules, slices) => `---\ntype: Bolt\ntitle: Take orders\ndescription: Take orders.\nintent: I-1\nmodules: [${modules}]\nslices: [${slices}]\nscope: ["${D}/**"]\n---\n\n# Why\nOrders.\n`;
  const plan = (bolt) => run(makeRepo({ 'docs/intents/I-1-orders.md': intent, 'docs/domains/orders.md': doc, 'docs/bolts/B-1-take.md': bolt }, ORDERS), ['check']).out.split('\n').filter((l) => /PLAN-SLICE/.test(l)).map((l) => l.replace(/ → .*$/, '').replace(/^\S+:\d+ /, ''));
  assert.deepEqual(plan(boltDoc('orders', 'createorder')), []);
  assert.deepEqual(plan(boltDoc('orders', 'createorder, cancelorder')), ['PLAN-SLICE B-1 lists slice cancelorder, which the orders domain doc\'s # Surface does not list']);
  assert.deepEqual(plan(boltDoc('shop-api', 'createorder')), ['PLAN-SLICE B-1 lists slices but binds no one domain: a horizontal bolt delivers no slice']);
  const dir = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', [`${D}/model/order.go`]: go('model') }, ORDERS);
  const unit = { id: 'B-1', modules: ['orders'], fm: { intent: 'I-1', slices: ['createorder'] } };
  const gate = (paths) => seam('gateChecks', ORDERS).flatMap((check) => check(dir, ORDERS, paths, [], unit)).filter((f) => f.key === 'sliceDeliverListed').map((f) => f.path);
  assert.deepEqual(gate([`${D}/model/order.go`]), [`${D}/application/createorder`], 'a listed slice the bolt does not touch');
  assert.deepEqual(gate([`${D}/application/createorder/handler.go`]), []);
});

// M29 B250: a slice's declaration, the same on its # Surface line as on its Unit of work's (docs/design/slice-method.md#one-grammar).
test('B250/AC-2 a # Surface line declares the slice\'s cuts and parts, required from method 13 and checked wherever a line carries one', async () => {
  const { declarationOf, declarationProblems } = await import('../plugin/cli/extensions/stacks/index.mjs');
  const { nameOf, registry } = await import('../plugin/cli/lib/index.mjs');
  assert.deepEqual(declarationOf('(ui, interface; data data/orders/orders; entry shop-api; permission P; async; emits OrderCreated.v1; calls stock; bogus x)'),
    { cuts: ['ui', 'interface'], unknown: ['bogus'], data: ['data/orders/orders'], entry: 'shop-api', permission: 'P', async: true, emits: ['OrderCreated.v1'], calls: ['stock'] });
  assert.equal(declarationOf('- Command placeorder: no declaration'), null);
  const doc = (surface) => `---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n${surface}\n`;
  const files = (surface, method) => ({
    'go.mod': 'module example.com/shop\n\ngo 1.22\n',
    [`${D}/application/placeorder/handler.go`]: go('placeorder', [`${D}/model`]), [`${D}/application/placeorder/handler_test.go`]: 'package placeorder\n',
    [`${D}/model/order.go`]: go('model'), [`${D}/interface/http.go`]: go('iface', [`${D}/application/placeorder`]),
    'docs/intents/I-1-orders.md': intent.replace('method: 12', `method: ${method}`), 'docs/domains/orders.md': doc(surface),
  });
  const found = (surface, method = 13) => lines(sliceFindings(makeRepo(files(surface, method), ORDERS), ORDERS));
  assert.deepEqual(found('- Command placeorder (interface, application, model; entry shop-api): a customer orders a cake [I-1:US1.1]'), [], 'declared');
  assert.deepEqual(found('- Command placeorder: a customer orders a cake [I-1:US1.1]'), ['SLICE-SURFACE docs/domains/orders.md sliceNoCuts'], 'method 13 asks for the declaration');
  assert.deepEqual(found('- Command placeorder: a customer orders a cake [I-1:US1.1]', 12), [], 'method 12 does not');
  assert.deepEqual(found('- Command placeorder (ui.web, interface; entry orders): a customer orders a cake [I-1:US1.1]', 12), ['SLICE-SURFACE docs/domains/orders.md sliceEntryRuntime', 'SLICE-SURFACE docs/domains/orders.md sliceUnknownCut'], 'a declaration is checked wherever it is');
  // The permission the registry composes for the slice's domains, and a ui unit of work's slice on a pack that has ui.
  const named = { ...ORDERS, naming: { tokens: { system: 'shop', org: 'contoso' }, domains: { orders: {} } } };
  const root = makeRepo({ 'tsconfig.json': '{}' }, named), bundle = join(root, 'docs'), ctx = { root, profile: named, bundle, slice: 'placeorder', domains: ['orders'] };
  const good = nameOf('permission', { domain: 'orders', action: 'write' }, registry(named, bundle));
  assert.deepEqual(declarationProblems(declarationOf(`(interface, application; permission ${good})`), ctx), []);
  assert.deepEqual(declarationProblems(declarationOf('(interface, application; permission Orders/write)'), ctx).map(([k]) => k), ['slicePermission']);
  assert.deepEqual(declarationProblems(declarationOf('(interface, application)'), { ...ctx, ui: true }).map(([k]) => k), ['sliceUi']);
  assert.deepEqual(declarationProblems(declarationOf('(ui, interface, application)'), { ...ctx, ui: true }), []);
});

// M29 B251: each pack says where a slice's own code sits in each layer, and scaffolds the layers a slice cuts
// (docs/design/slice-method.md#layers).
test('B251/AC-1 each pack lists slicePaths, the route under interface/<slice> and ui where the stack has one; the surfaces sit beside the layers', () => {
  const read = (s) => JSON.parse(readFileSync(join(ROOT, `plugin/packs/${s}/manifest.json`), 'utf8'));
  for (const s of ['go', 'typescript']) assert.match(read(s).slicePaths.interface, /\/interface\/\{\{slice\}\}\./, s);
  assert.deepEqual([read('typescript'), read('go')].map((m) => Object.keys(m.slicePaths.ui)), [['web', 'cli'], ['cli', 'template']], 'the ui forms each stack serves');
  const dir = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', [`${D}/application/placeorder/handler.go`]: go('placeorder', [`${D}/model`]), [`${D}/application/placeorder/handler_test.go`]: 'package placeorder\n',
    [`${D}/model/order.go`]: go('model'), [`${D}/interface/placeorder.go`]: go('iface', [`${D}/application/placeorder`]), [`${D}/client/client.go`]: go('client'), [`${D}/events/events.go`]: go('events') }, ORDERS);
  assert.deepEqual(lines(sliceFindings(dir, ORDERS)).filter((l) => /SLICE-PLACE/.test(l)), [], 'client and events beside the layers');
});

test('B251/AC-2 scaffold writes the own code of each cut a slice declares, and every reference routes each slice under interface/<slice> and passes the slice checks', async () => {
  const { run } = await import('./state-repo.mjs');
  const doc = (line) => `---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n${line}\n`;
  const ts = makeRepo({ 'tsconfig.json': '{}\n', 'docs/domains/orders.md': doc('- Command createorder (ui, interface, application; entry shop-api): a customer orders [I-1:US1.1]') }, { naming: { tokens: { system: 'shop' }, domains: { orders: {} } } });
  const wrote = run(ts, ['scaffold', 'slice', 'create', '--domain', 'orders']).out.split('\n').filter(Boolean);
  assert.deepEqual(wrote, ['ui/web/createorder/screen.ts', 'ui/web/createorder/screen.spec.ts', 'ui/cli/createorder/command.ts', 'ui/cli/createorder/command.spec.ts', 'interface/createorder.ts', 'interface/createorder.spec.ts', 'application/createorder/handler.ts', 'application/createorder/handler.spec.ts'].map((p) => `wrote src/domains/orders/${p}`));
  const go2 = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n' }, { naming: { tokens: { system: 'shop' }, domains: { orders: {} } } });
  assert.deepEqual(run(go2, ['scaffold', 'slice', 'get', '--domain', 'orders']).out.split('\n').filter(Boolean),
    ['interface/getorder.go', 'interface/getorder_test.go', 'application/getorder/handler.go', 'application/getorder/handler_test.go'].map((p) => `wrote internal/domains/orders/${p}`), 'with no declaration, the cuts with own code but ui');
  for (const [ref, files] of [['plugin/packs/go/reference', ['internal/domains/notes/interface/createnote.go', 'internal/domains/notes/interface/getnote.go']],
    ['plugin/packs/typescript/reference', ['src/domains/notes/interface/createnote.ts', 'src/domains/notes/interface/getnote.ts', 'src/domains/notes/ui/web/createnote/screen.ts']],
    ['examples/models/control-plane/reference/go', ['internal/domains/resources/interface/createresource.go', 'internal/domains/resources/interface/deleteresource.go', 'internal/domains/operations/interface/getoperation.go']]]) {
    for (const f of files) assert.ok(existsSync(join(ROOT, ref, f)), `${ref}: ${f}`);
  }
  const notes = { system: { core: ['src/**'] }, modules: [{ id: 'notes', kind: 'domain', paths: ['src/domains/notes/**'] }, { id: 'notes-api', kind: 'runtime', paths: ['src/runtimes/notes-api/**'] }] };
  const tsRef = makeRepo({}, notes);
  cpSync(join(ROOT, 'plugin/packs/typescript/reference'), tsRef, { recursive: true });
  assert.deepEqual(lines(sliceFindings(tsRef, notes)), [], 'the TypeScript reference passes every slice check');
});

test('B251/AC-1 a project\'s own name for the ui layer maps to it, as the other layers\' do', async () => {
  const { config } = await import('../plugin/cli/lib/index.mjs');
  const V = config.vocabulary;
  for (const alias of ['web', 'frontend']) assert.equal(V.layerAliases[alias], 'ui');
  assert.deepEqual(Object.values(V.layerAliases).filter((l) => !(l in V.layerRules)), [], 'every alias names a layer with its rule');
});

// M29 B252: a bolt's scope covers each layer its slices cut, and its diff changes each one (docs/design/slice-method.md#proved).
test('B252/AC-1 B252/AC-3 a listed slice\'s cuts are in the bolt\'s scope, and the gate refuses a cut the diff leaves unchanged', async () => {
  const { run } = await import('./state-repo.mjs');
  const doc = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (interface, application, model, migration; entry shop-api): a customer orders a cake [I-1:US1.1]\n';
  const boltDoc = (scope) => `---\ntype: Bolt\ntitle: Take orders\ndescription: Take orders.\nintent: I-1\nmodules: [orders]\nslices: [createorder]\nscope: [${scope.map((s) => `"${s}"`).join(', ')}]\n---\n\n# Why\nOrders.\n`;
  const plan = (scope) => run(makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/intents/I-1-orders.md': intent, 'docs/domains/orders.md': doc, 'docs/bolts/B-1-take.md': boltDoc(scope) }, ORDERS), ['check']).out.split('\n').filter((l) => /PLAN-SLICE/.test(l)).map((l) => l.replace(/ → .*$/, '').replace(/^\S+:\d+ /, ''));
  assert.deepEqual(plan([`${D}/**`, 'migrations/orders/**']), [], 'every cut in scope');
  assert.deepEqual(plan([`${D}/**`]), ['PLAN-SLICE B-1 lists slice createorder, which cuts migration, but its scope does not cover migrations/orders']);
  const dir = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': doc }, ORDERS);
  const unit = { id: 'B-1', modules: ['orders'], fm: { intent: 'I-1', slices: ['createorder'] } };
  const gate = (paths) => seam('gateChecks', ORDERS).flatMap((check) => check(dir, ORDERS, paths, [], unit)).filter((f) => f.key === 'sliceDeliverCut').map((f) => `${f.data.cut} ${f.path}`);
  assert.deepEqual(gate([`${D}/application/createorder/handler.go`, `${D}/interface/createorder.go`]), [`model ${D}/model`, 'migration migrations/orders']);
  assert.deepEqual(gate([`${D}/application/createorder/handler.go`, `${D}/interface/createorder.go`, `${D}/model/order.go`, 'migrations/orders/0002_createorder.sql']), [], 'every cut changed');
});

test('B252/AC-2 the card lists each slice\'s cuts as ordered steps, test first, from the bottom layer up, after its scaffold command', () => {
  const doc = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (interface, application, model, migration; entry shop-api): a customer orders a cake [I-1:US1.1]\n';
  const dir = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': doc }, NAMED);
  const card = (fm, profile = NAMED) => seam('cardSlices', profile).flatMap((section) => section(dir, { id: 'B-1', modules: ['orders'], fm }, profile)).join('');
  const text = card({ slices: ['createorder'] });
  assert.match(text, /each one's failing test before its code/);
  assert.match(text, /hollow/, 'the reviewer reads the same card');
  assert.ok(text.includes(`createorder: \`aidlc scaffold slice create --domain orders\`\n1. migration: migrations/orders\n2. model: ${D}/model\n3. application: ${D}/application/createorder\n4. interface: ${D}/interface/createorder.go\n`), text);
  assert.equal(card({}), '', 'a bolt listing no slice');
  assert.equal(card({ slices: ['createorder'] }, ORDERS).includes('aidlc scaffold'), false, 'no registry, no scaffold command');
});

test('B252/AC-4 SLICE-DATA refuses a data edge a slice does not declare; SLICE-ROUTE refuses an entry that does not mount its domain\'s routes, and a runtime no slice names that does', () => {
  const doc = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (interface, application; data data/orders/orders; entry shop-api): a customer orders a cake [I-1:US1.1]\n';
  const profile = { ...ORDERS, modules: [...ORDERS.modules, { id: 'admin-api', kind: 'runtime', paths: ['cmd/admin-api/**'] }] };
  const handler = (sql) => `package createorder\n\nconst q = "${sql}"\n`;
  const found = (files) => graphFindings(makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': doc,
    [`${D}/application/createorder/handler.go`]: handler('select id from orders.orders'), [`${D}/interface/createorder.go`]: go('iface', [`${D}/application/createorder`]),
    'cmd/shop-api/main.go': go('main', [`${D}/interface`]), ...files }, profile), profile).map((f) => `${f.code} ${f.path} ${msg(f.key, f.data)}`);
  assert.deepEqual(found({}), [], 'declared data, routes mounted by the entry');
  assert.deepEqual(found({ [`${D}/application/createorder/handler.go`]: handler('select id from orders.carts') }), [`SLICE-DATA ${D}/application/createorder slice orders/createorder reaches data node data/orders/carts, which its declaration does not name`]);
  assert.deepEqual(found({ 'cmd/shop-api/main.go': go('main'), 'cmd/admin-api/main.go': go('main', [`${D}/interface`]) }), [
    `SLICE-ROUTE ${D}/interface runtime shop-api, the entry of createorder in domain orders, does not import ${D}/interface`,
    'SLICE-ROUTE cmd/admin-api runtime admin-api imports domain orders\'s interface layer, though its slices name shop-api as their entry',
  ]);
});

test('B252/AC-4 SLICE-INTEGRATE refuses a client, adapter or events import a slice does not declare, and a declared call or event its code never imports', () => {
  const B = 'internal/domains/billing';
  const profile = { ...ORDERS, modules: [...ORDERS.modules, { id: 'billing', kind: 'domain', paths: [`${B}/**`] }, { id: 'stripe', kind: 'adapter', paths: ['internal/adapters/stripe/**'] }] };
  const surface = (decl) => `---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (${decl}): a customer orders a cake [I-1:US1.1]\n- Events: OrderPlaced\n`;
  const full = 'interface, application; entry shop-api; emits OrderPlaced; consumes PaymentTaken; calls billing';
  const found = (decl, imports) => graphFindings(makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': surface(decl),
    'docs/domains/billing.md': '---\ntype: Domain\ntitle: Billing\ndescription: Billing.\ncode: billing\nkind: domain\n---\n\n# Surface\n- Events: PaymentTaken\n',
    [`${D}/application/createorder/handler.go`]: go('createorder', imports), [`${D}/interface/createorder.go`]: go('iface', [`${D}/application/createorder`]),
    [`${D}/events/events.go`]: go('events'), [`${B}/client/client.go`]: go('client'), [`${B}/events/events.go`]: go('events'), 'internal/adapters/stripe/stripe.go': go('stripe'),
    'cmd/shop-api/main.go': go('main', [`${D}/interface`]) }, profile), profile).map((f) => `${f.code} ${msg(f.key, f.data)}`);
  const all = [`${B}/client`, `${B}/events`, `${D}/events`];
  assert.deepEqual(found(full, all), [], 'each import declared, each declared one imported');
  assert.deepEqual(found(full, [...all, 'internal/adapters/stripe']), ['SLICE-INTEGRATE slice orders/createorder imports internal/adapters/stripe, which its declaration does not name']);
  assert.deepEqual(found(full, [`${B}/events`, `${D}/events`]), ['SLICE-INTEGRATE slice orders/createorder declares billing, which its code never imports']);
  assert.deepEqual(found('interface, application; entry shop-api', all), [`SLICE-INTEGRATE slice orders/createorder imports ${B}/client, which its declaration does not name`,
    `SLICE-INTEGRATE slice orders/createorder imports ${B}/events, which its declaration does not name`, `SLICE-INTEGRATE slice orders/createorder imports ${D}/events, which its declaration does not name`]);
});

test('B252/AC-4 SLICE-GOVERN refuses a slice with no permission behind an entry applying a pipeline stage, and one importing a stage itself', () => {
  const model = { name: 'shop', title: 'Shop', description: 'A shop.', layers: [{ id: 'shop-api', kind: 'runtime', role: 'the entry', applies: ['authorize'] }, { id: 'authorize', kind: 'pipeline', role: 'whether the caller may' }] };
  const profile = { ...ORDERS, model: { name: 'shop' }, modules: [...ORDERS.modules, { id: 'authorize', kind: 'pipeline', paths: ['internal/pipeline/authorize/**'] }] };
  const surface = (decl) => `---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (${decl}): a customer orders a cake [I-1:US1.1]\n`;
  const found = (decl, imports = [], p = profile) => graphFindings(makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': surface(decl), '.aidlc/models/shop/model.json': JSON.stringify(model),
    [`${D}/application/createorder/handler.go`]: go('createorder', imports), [`${D}/interface/createorder.go`]: go('iface', [`${D}/application/createorder`]),
    'internal/pipeline/authorize/authorize.go': go('authorize'), 'cmd/shop-api/main.go': go('main', [`${D}/interface`]) }, p), p).map((f) => `${f.code} ${f.path} ${msg(f.key, f.data)}`);
  assert.deepEqual(found('interface, application; entry shop-api; permission orders.write'), [], 'its permission declared, its governance left to the entry');
  assert.deepEqual(found('interface, application; entry shop-api'), ['SLICE-GOVERN docs/domains/orders.md slice orders/createorder names no permission, though its entry shop-api applies authorize']);
  assert.deepEqual(found('interface, application; entry shop-api', [], { ...profile, model: undefined }), [], 'no chosen model, no stage the entry applies');
  assert.deepEqual(found('interface, application; entry shop-api; permission orders.write', ['internal/pipeline/authorize']), [`SLICE-GOVERN ${D}/application/createorder slice orders/createorder imports internal/pipeline/authorize, a pipeline stage its entry runs for every slice`]);
});

// M29 B260: the ui cut's forms (docs/design/slice-method.md#layers).
test('B260/AC-1 a pack maps each ui form it has to its path; a declaration cuts ui.<form>, or ui for every form; a form the pack lacks is reported', () => {
  const notes = { system: { core: ['src/**'] }, modules: [{ id: 'notes', kind: 'domain', paths: ['src/domains/notes/**'] }, { id: 'notes-api', kind: 'runtime', paths: ['src/runtimes/notes-api/**'] }] };
  const doc = (decl) => `---\ntype: Domain\ntitle: Notes\ndescription: Notes.\ncode: notes\nkind: domain\n---\n\n# Surface\n- Command createnote (${decl}): a writer keeps a note [I-1:US1.1]\n`;
  const dir = makeRepo({ 'tsconfig.json': '{}\n', 'docs/domains/notes.md': doc('ui, interface, application') }, notes);
  const [stacks] = seam('sliceDeclaration', notes), m = stacks.pack(dir).manifest;
  assert.deepEqual(m.slicePaths.ui, { web: '{{dir}}/ui/web/{{slice}}', cli: '{{dir}}/ui/cli/{{slice}}' }, 'the TypeScript pack has the web and cli forms');
  assert.deepEqual(stacks.declared(dir, notes, 'notes', 'createnote').cuts, ['ui.web', 'ui.cli', 'interface', 'application'], 'ui stands for every form the pack has');
  assert.equal(stacks.path(m, 'notes', 'createnote', 'ui.web'), 'src/domains/notes/ui/web/createnote');
  const problems = (decl, ui = false) => stacks.problems(stacks.parse(`(${decl})`), { root: dir, profile: notes, bundle: join(dir, 'docs'), slice: 'createnote', domains: ['notes'], ui }).map(([key, data]) => msg(key, data));
  assert.deepEqual(problems('ui.web, interface'), []);
  assert.deepEqual(problems('ui, interface'), []);
  assert.equal(problems('ui.template, interface').length, 1);
  assert.match(problems('ui.template, interface')[0], /ui\.template/);
  assert.deepEqual(problems('ui.web, interface', true), [], 'a ui unit of work\'s slice cuts a ui form');
  assert.equal(problems('interface', true).length, 1, 'or is reported');
  assert.ok(stacks.cuts().includes('ui.web') && stacks.cuts().includes('ui'), 'models may name a form or ui');
});

test('B260/AC-2 scaffold writes each ui form\'s own code and test; a template form names the slice\'s resource type and route in the template schema', async () => {
  const { run } = await import('./state-repo.mjs');
  const doc = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (ui, interface, application; entry shop-api): a customer orders [I-1:US1.1]\n';
  const dir = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': doc }, { naming: { tokens: { system: 'shop', org: 'acme' }, domains: { orders: {} } } });
  assert.deepEqual(run(dir, ['scaffold', 'slice', 'create', '--domain', 'orders']).out.split('\n').filter(Boolean),
    ['ui/cli/createorder/command.go', 'ui/cli/createorder/command_test.go', 'ui/template/createorder/schema.json', 'ui/template/createorder/template_test.go', 'interface/createorder.go', 'interface/createorder_test.go', 'application/createorder/handler.go', 'application/createorder/handler_test.go'].map((p) => `wrote ${D}/${p}`));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, D, 'ui/template/createorder/schema.json'), 'utf8')), { type: 'Acme.Shop/orders', route: '/providers/Acme.Shop/orders/{orderName}', operation: 'createorder', properties: {} });
  assert.match(readFileSync(join(dir, D, 'ui/template/createorder/template_test.go'), 'utf8'), /deployment applying a template .* calls the slice's\n\/\/ route/);
});

// M29 B253: each slice proved through its entry and its hand-offs (docs/design/slice-method.md#proved).
test('B253/AC-1 SLICE-TEST: a route test names each slice and its permission; a hand-off test names each event and call, a consumer\'s the publisher, an async slice\'s a terminal state', () => {
  const B = 'internal/domains/billing';
  const surface = '---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (interface, application; entry shop-api; permission orders.write; async; emits OrderPlaced; consumes PaymentTaken; calls billing): a customer orders [I-1:US1.1]\n- Events: OrderPlaced\n';
  const profile = { ...ORDERS, modules: [...ORDERS.modules, { id: 'billing', kind: 'domain', paths: [`${B}/**`] }],
    levels: { unit: { paths: ['internal/**/*_test.go'], run: 'go test ./...', proves: ['route'] }, integration: { paths: ['tests/integration/**'], run: 'go test ./tests/...', proves: ['handoff'] } } };
  const route = 'func TestRoute_createorder(t *testing.T) { /* refused without orders.write */ }\n', handoff = '// createorder emits OrderPlaced; consumes PaymentTaken from billing; calls billing; polls until Succeeded\n';
  const found = (files, p = profile) => testFindings(makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': surface,
    'docs/domains/billing.md': '---\ntype: Domain\ntitle: Billing\ndescription: Billing.\ncode: billing\nkind: domain\n---\n\n# Surface\n- Events: PaymentTaken\n',
    [`${D}/interface/createorder_test.go`]: route, 'tests/integration/orders_test.go': handoff, ...files }, p), p).map((f) => `${f.path} ${msg(f.key, f.data)}`);
  assert.deepEqual(found({}), [], 'proved through its entry and each hand-off');
  assert.deepEqual(found({}, { ...profile, levels: { unit: { paths: ['**/*_test.go'] } } }), [], 'no level proves anything: nothing is required');
  const at = `${D}/application/createorder`;
  assert.deepEqual(found({ [`${D}/interface/createorder_test.go`]: 'func TestRoute(t *testing.T) {}\n' }), [`${at} slice orders/createorder has no test at a route level that names it, so nothing proves it through its entry`]);
  assert.deepEqual(found({ [`${D}/interface/createorder_test.go`]: 'func TestRoute_createorder(t *testing.T) {}\n' }), [`${at} slice orders/createorder's route tests never name its permission orders.write, so none sees a request without it refused`]);
  assert.deepEqual(found({ 'tests/integration/orders_test.go': '// createorder emits OrderPlaced; consumes PaymentTaken; polls until failed\n' }), [
    `${at} slice orders/createorder declares billing, which no test at a handoff level names`,
    `${at} slice orders/createorder's hand-off test of PaymentTaken never names its publisher billing`]);
  assert.deepEqual(found({ 'tests/integration/orders_test.go': '// createorder emits OrderPlaced; consumes PaymentTaken from billing; calls billing\n' }), [`${at} slice orders/createorder is async, but no hand-off test naming it follows the status to a terminal state (Succeeded, Failed, Canceled)`]);
});

test('B253/AC-2 INCR-SKELETON: from method 13, increment 1\'s first slice cuts every layer the pack has, any ui form counting for ui', async () => {
  const { run } = await import('./state-repo.mjs');
  const doc = (cuts) => `---\ntype: Domain\ntitle: Orders\ndescription: Orders.\ncode: orders\nkind: domain\n---\n\n# Surface\n- Command createorder (${cuts}; entry shop-api): a customer orders a cake [I-1:US1.1]\n`;
  const bolt = '---\ntype: Bolt\ntitle: Take orders\ndescription: Take orders.\nintent: I-1\nmodules: [orders]\nslices: [createorder]\nscope: ["internal/**", "migrations/**"]\n---\n\n# Why\nOrders.\n';
  const skeleton = (cuts, method = 13) => run(makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/intents/I-1-orders.md': intent.replace('method: 12', `method: ${method}`), 'docs/domains/orders.md': doc(cuts), 'docs/bolts/B-1-take.md': bolt }, ORDERS), ['check'])
    .out.split('\n').filter((l) => /INCR-SKELETON/.test(l)).map((l) => l.replace(/ → .*$/, '').replace(/^\S+:\d+ /, ''));
  assert.deepEqual(skeleton('interface, application'), ['INCR-SKELETON increment 1\'s first slice, createorder of B-1, cuts no ui, model, infrastructure, migration: the walking skeleton cuts every layer the stack pack has']);
  assert.deepEqual(skeleton('ui.cli, interface, application, model, infrastructure, migration'), [], 'every layer, ui by one of its forms');
  assert.deepEqual(skeleton('interface, application', 12), [], 'before method 13');
});

test('B253/AC-3 each slice reported planned, partial or done, layer by layer, with its hand-offs; the trace lists its permission; the retro reads a refusal\'s layer', () => {
  const A = 'internal/domains/activity';
  const profile = { ...ORDERS, modules: [...ORDERS.modules, { id: 'activity', kind: 'domain', paths: [`${A}/**`] }, { id: 'billing', kind: 'domain', paths: ['internal/domains/billing/**'] }] };
  const dom = (code, lines) => `---\ntype: Domain\ntitle: ${code}\ndescription: ${code}.\ncode: ${code}\nkind: domain\n---\n\n# Surface\n${lines}\n`;
  const dir = makeRepo({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n',
    'docs/domains/orders.md': dom('orders', '- Command createorder (interface, application, model; entry shop-api; permission orders.write; emits OrderPlaced; calls billing): a customer orders [I-1:US1.1]\n- Events: OrderPlaced'),
    'docs/domains/activity.md': dom('activity', '- Query listactivity (interface, application; consumes OrderPlaced): a customer reads the log [I-1:US1.1]'),
    'docs/domains/billing.md': dom('billing', '- Events: PaymentTaken'),
    'docs/bolts/B-1-take.md': '---\ntype: Bolt\ntitle: Take\ndescription: Take.\nintent: I-1\nmodules: [orders]\nslices: [createorder]\nscope: ["internal/**"]\n---\n\n# Why\nOrders.\n',
    [`${D}/application/createorder/handler.go`]: go('createorder'), [`${D}/interface/createorder.go`]: go('iface') }, profile);
  const status = seam('statusLines', profile).at(-1)({ cwd: dir, profile }); // the slices extension's, plugged last
  assert.match(status, /orders\/createorder: partial; done interface, application; to do model\n {4}→ activity\/listactivity \(OrderPlaced\)\n {4}→ billing \(call\)\n/, status);
  assert.match(status, /activity\/listactivity: planned; done -; to do interface, application\n/);
  const [page] = seam('mapPages', profile).flatMap((p) => p(dir, profile, 'architecture/map'));
  assert.equal(page.file, 'architecture/map-slices.md');
  assert.match(page.body, /orders\/createorder: partial/);
  const trace = seam('traceSections', profile).map((s) => s(dir, profile, { id: 'I-1' })).join('');
  assert.match(trace, /\| orders\/createorder \| orders\.write \| shop-api \|/);
  assert.doesNotMatch(trace, /listactivity/, 'only the slices the intent\'s bolts list');
  const [layerOf] = seam('layerOf', profile);
  assert.deepEqual([`${D}/application/createorder/handler.go`, `${D}/model`, 'cmd/shop-api/main.go', 'README.md'].map((p) => layerOf(dir, profile, p)), ['application', 'model', 'runtime', null]);
});
