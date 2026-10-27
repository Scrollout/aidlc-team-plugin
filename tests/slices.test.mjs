// M27 B245: vertical slices across a domain's horizontal layers, checked from the pack's graph, the folders, the
// domain doc and the tests (docs/design/vertical-slices.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { seam } from '../plugin/cli/lib/index.mjs';
import '../plugin/cli/extensions/intake/index.mjs'; // its stories seam, as the CLI loads every extension
import { sliceFindings } from '../plugin/cli/extensions/stacks/index.mjs';
import { makeRepo } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const NOTES = { system: { core: ['internal/**', 'cmd/**'] }, modules: [{ id: 'notes', kind: 'domain', paths: ['internal/domains/notes/**'] }, { id: 'notes-api', kind: 'runtime', paths: ['cmd/notes-api/**'] }] };
const lines = (fs) => fs.map((f) => `${f.code} ${f.path} ${f.key}`).sort();
const go = (pkg, imports = []) => `package ${pkg}\n\nimport (\n${imports.map((i) => `\t"example.com/shop/${i}"`).join('\n')}\n)\n`;
const D = 'internal/domains/orders';
const ORDERS = { system: { core: ['internal/**', 'cmd/**'] }, modules: [{ id: 'orders', kind: 'domain', paths: [`${D}/**`] }, { id: 'shop-api', kind: 'runtime', paths: ['cmd/shop-api/**'] }] };
const intent = '---\ntype: Intent\ntitle: Orders\ndescription: Orders.\npathway: feature\n---\n\n# Stories\n- US1.1 As a customer, I want to order, so that I get a cake. [Q-1.1]\n';

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
