// M17: the architecture model's checks over the dependency graph (docs/design/architecture-model.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindFindings, layerFindings, reachFindings } from '../plugin/cli/lib/domains/architecture.mjs';

const layers = (d) => ({ interface: [`internal/domains/${d}/interface/**`], application: [`internal/domains/${d}/application/**`], model: [`internal/domains/${d}/model/**`], infrastructure: [`internal/domains/${d}/infrastructure/**`] });
const domain = (d) => ({ id: d, kind: 'domain', paths: [`internal/domains/${d}/**`], layers: layers(d), surfaces: { client: [`internal/domains/${d}/client`], events: [`internal/domains/${d}/events`], server: [`internal/domains/${d}/interface`] } });
const PROFILE = { modules: [
  domain('orders'), domain('billing'),
  { id: 'database', kind: 'foundation', paths: ['internal/foundation/database/**'] },
  { id: 'config', kind: 'foundation', paths: ['internal/foundation/config/**'] },
  { id: 'ingress', kind: 'pipeline', paths: ['internal/pipeline/ingress/**'] },
  { id: 'shop-api', kind: 'runtime', paths: ['cmd/shop-api/**'] },
  { id: 'payments', kind: 'extension', paths: ['extensions/payments/**'] },
  { id: 'deploy', kind: 'delivery', paths: ['deploy/**', 'tools/**'] },
] };
const lines = (fs) => fs.map((f) => `${f.code} ${f.message}`);

test('B166/AC-1 the kind table decides each edge: domains reach other domains only through client or events, the core never an extension, product code never delivery', () => {
  assert.deepEqual(lines(kindFindings([
    ['internal/domains/orders/application', 'internal/foundation/database'],
    ['internal/domains/orders/application', 'internal/domains/billing/client'],
    ['internal/domains/orders/application', 'internal/domains/billing/infrastructure'],
    ['internal/foundation/database', 'internal/domains/orders/model'],
    ['internal/pipeline/ingress', 'internal/domains/orders/events'],
    ['internal/domains/orders/model', 'extensions/payments'],
    ['internal/domains/orders/application', 'tools/archgraph'],
    ['tools/archgraph', 'internal/domains/orders/model'],
    ['cmd/shop-api', 'internal/domains/orders/interface'],
    ['internal/domains/orders/application', 'internal/domains/orders/model'],
    ['vendor/x', 'internal/domains/orders/model'],
  ], PROFILE)), [
    'ARCH-KIND internal/domains/orders/application -> internal/domains/billing/infrastructure: orders (domain) may not depend on billing (domain), only on its client or events (internal/domains/billing/client, internal/domains/billing/events)',
    'ARCH-KIND internal/foundation/database -> internal/domains/orders/model: database (foundation) may not depend on orders (domain)',
    'ARCH-KIND internal/domains/orders/model -> extensions/payments: orders (domain) may not depend on payments (extension)',
    'ARCH-KIND internal/domains/orders/application -> tools/archgraph: orders (domain) may not depend on deploy (delivery)',
  ]);
  assert.deepEqual(kindFindings([['a/x', 'b/y']], { modules: [{ id: 'a', paths: ['a/**'] }, { id: 'b', paths: ['b/**'] }] }), [], 'a v1 profile without kinds: nothing');
});

test('B167/AC-1 layers point inward: interface to application and model, application and infrastructure to model; a model depends only on foundation', () => {
  assert.deepEqual(lines(layerFindings([
    ['internal/domains/orders/interface', 'internal/domains/orders/application'],
    ['internal/domains/orders/application', 'internal/domains/orders/model'],
    ['internal/domains/orders/infrastructure', 'internal/domains/orders/model'],
    ['internal/domains/orders/model', 'internal/domains/orders/infrastructure'],
    ['internal/domains/orders/application', 'internal/domains/orders/interface'],
    ['internal/domains/orders/model', 'internal/foundation/config'],
    ['internal/domains/orders/model', 'internal/domains/billing/client'],
  ], PROFILE)), [
    'ARCH-LAYER internal/domains/orders/model -> internal/domains/orders/infrastructure: model may not depend on infrastructure in orders',
    'ARCH-LAYER internal/domains/orders/application -> internal/domains/orders/interface: application may not depend on interface in orders',
    'ARCH-LAYER internal/domains/orders/model -> internal/domains/billing/client: the model of orders depends on billing (domain); a model depends only on foundation kits',
  ]);
  const v1 = { modules: [{ id: 'registry', kind: 'domain', paths: ['internal/registry/**'], layers: { api: ['internal/registry/api/**'], app: ['internal/registry/app/**'], domain: ['internal/registry/domain/**'], store: ['internal/registry/store/**'] } }] };
  assert.deepEqual(lines(layerFindings([['internal/registry/domain', 'internal/registry/store'], ['internal/registry/api', 'internal/registry/app']], v1)), ['ARCH-LAYER internal/registry/domain -> internal/registry/store: model may not depend on infrastructure in registry'], 'v1 layer names read as the canonical four');
});

test('B169/AC-1 a runtime hosts the domains it imports directly; reaching another domain beyond its surfaces through anything it links is ARCH-REACH', () => {
  const edges = [
    ['cmd/shop-api', 'internal/domains/orders/interface'],
    ['cmd/shop-api', 'internal/pipeline/ingress'],
    ['internal/pipeline/ingress', 'internal/domains/billing/client'],
    ['internal/domains/billing/client', 'internal/domains/billing/application'],
    ['internal/domains/orders/interface', 'internal/domains/orders/application'],
  ];
  assert.deepEqual(lines(reachFindings(edges, PROFILE)), ['ARCH-REACH runtime shop-api reaches internal/domains/billing/application, inside billing, which it does not host: cmd/shop-api -> internal/pipeline/ingress -> internal/domains/billing/client -> internal/domains/billing/application']);
  assert.deepEqual(reachFindings(edges.slice(0, 3), PROFILE), [], 'a client that links only itself is fine');
});

test('B168/AC-1 a module surface is its client and events; ARCH-API judges modules without kinds, ARCH-KIND those with', async () => {
  const { moduleFindings } = await import('../plugin/cli/lib/domains/gate.mjs');
  const mods = (kind) => [{ id: 'registry', paths: ['internal/registry/**'], surfaces: { client: ['internal/registry/client'], server: ['internal/registry/api'] }, ...(kind ? { kind: 'domain' } : {}) }, { id: 'frontdoor', paths: ['internal/frontdoor/**'], ...(kind ? { kind: 'pipeline' } : {}) }];
  const edges = [['internal/frontdoor/app', 'internal/registry/api'], ['internal/frontdoor/app', 'internal/registry/client']];
  assert.deepEqual(lines(moduleFindings(edges, { modules: mods(false) })), ['ARCH-API internal/frontdoor/app -> internal/registry/api: internal/registry/api is inside registry; depend only on its public paths (internal/registry/client)'], 'the server surface is not public');
  assert.deepEqual(moduleFindings(edges, { modules: mods(true) }), [], 'with kinds ARCH-API steps aside');
  assert.deepEqual(lines(kindFindings(edges, { modules: mods(true) })), ['ARCH-KIND internal/frontdoor/app -> internal/registry/api: frontdoor (pipeline) may not depend on registry (domain), only on its client or events (internal/registry/client)']);
});
