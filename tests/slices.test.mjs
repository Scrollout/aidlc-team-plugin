// M27 B245: vertical slices across a domain's horizontal layers, checked from the pack's graph, the folders, the
// domain doc and the tests (docs/design/vertical-slices.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { seam } from '../plugin/cli/lib/index.mjs';
import '../plugin/cli/extensions/intake/index.mjs'; // its stories seam, as the CLI loads every extension
import { sliceFindings } from '../plugin/cli/extensions/stacks/index.mjs';
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
  assert.deepEqual(found('- Command placeorder: a customer orders a cake [I-1:US1.1]'), ['SLICE-SURFACE docs/domains/orders.md sliceDeclNone'], 'method 13 asks for the declaration');
  assert.deepEqual(found('- Command placeorder: a customer orders a cake [I-1:US1.1]', 12), [], 'method 12 does not');
  assert.deepEqual(found('- Command placeorder (ui, interface; entry orders): a customer orders a cake [I-1:US1.1]', 12), ['SLICE-SURFACE docs/domains/orders.md sliceCut', 'SLICE-SURFACE docs/domains/orders.md sliceEntryRuntime'], 'a declaration is checked wherever it is');
  // The permission the registry composes for the slice's domains, and a ui unit of work's slice on a pack that has ui.
  const named = { ...ORDERS, naming: { tokens: { system: 'shop', org: 'contoso' }, domains: { orders: {} } } };
  const root = makeRepo({ 'tsconfig.json': '{}' }, named), bundle = join(root, 'docs'), ctx = { root, profile: named, bundle, slice: 'placeorder', domains: ['orders'] };
  const good = nameOf('permission', { domain: 'orders', action: 'write' }, registry(named, bundle));
  assert.deepEqual(declarationProblems(declarationOf(`(interface, application; permission ${good})`), ctx), []);
  assert.deepEqual(declarationProblems(declarationOf('(interface, application; permission Orders/write)'), ctx).map(([k]) => k), ['slicePermission']);
  assert.deepEqual(declarationProblems(declarationOf('(interface, application)'), { ...ctx, ui: true }).map(([k]) => k), ['sliceUi']);
  assert.deepEqual(declarationProblems(declarationOf('(ui, interface, application)'), { ...ctx, ui: true }), []);
});
