// B267: every name of a slice composed from one set of coordinates, and checked by rules the registry generates
// (docs/design/naming-coordinates.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { config, generatedRules, nameOf, registry } from '../plugin/cli/lib/index.mjs';
import { I1, commit, makeRepo, run } from './state-repo.mjs';
import '../plugin/cli/extensions/stacks/index.mjs'; // the stack packs' naming layer, as the CLI loads it
import { PROFILE, codes, merge, setup } from './gate-repo.mjs';

const NAMING = { tokens: { system: 'shop', org: 'acme' }, domains: { orders: {} } };
const GO = { 'go.mod': 'module example.com/shop\n\ngo 1.22\n' };
const full = (rule, s) => new RegExp(`^(?:${rule.pattern})$`).test(s);
const found = (rule, text) => [...text.matchAll(new RegExp(rule.find, 'g'))].map((m) => m[1]);
const lines = (out, code) => out.split('\n').filter((l) => l.includes(` ${code} `));

test('B267/AC-1 a kind the architecture model or the project adds survives the merge, field by field, and aidlc name prints it', () => {
  const model = { grammar: { queue: { template: '{{system}}-{{domain}}-queue', needs: ['system', 'domain'], regex: '^[a-z-]+$' } } };
  const naming = { ...NAMING, grammar: { queue: { template: '{{system}}-{{domain}}-q' }, topic: { template: '{{system}}.{{domain}}', needs: ['system', 'domain'], regex: '^[a-z.]+$' } } };
  const dir = makeRepo(I1, { model, naming });
  assert.equal(run(dir, ['name', 'queue', '--domain', 'orders']).out, 'shop-orders-q\n', 'the project overrides the template, the model keeps the rest');
  assert.equal(run(dir, ['name', 'topic', '--domain', 'orders']).out, 'shop.orders\n');
  assert.match(run(dir, ['name', 'nonsense']).err, /kinds: .*, queue, topic/);
  const reg = registry({ model, naming });
  assert.deepEqual(reg.grammar.queue.needs, ['system', 'domain']);
  assert.ok(Object.keys(config.naming.grammar).every((k) => reg.grammar[k]), 'the plugin kinds stay');
  // A new kind without a template or a regex is PROFILE-NAMING, and aidlc name refuses it.
  const half = makeRepo(I1, { naming: { ...NAMING, grammar: { lane: { template: '{{system}}-lane' } } } });
  assert.match(run(half, ['check']).out, /PROFILE-NAMING naming kind lane needs a template and a regex/);
  assert.match(run(half, ['name', 'lane']).err, /usage: aidlc name <kind>/);
});

test('B267/AC-2 the registry generates the event, permission and table rules: each composed name passes, a misnamed one does not; slice folders stay SLICE-NAME\'s', () => {
  const dir = makeRepo(GO, { naming: NAMING });
  const reg = registry({ naming: NAMING }, join(dir, 'docs'), dir);
  const rules = Object.fromEntries(generatedRules({ naming: NAMING }, join(dir, 'docs'), dir).map((r) => [r.id, r]));
  for (const verb of reg.vocabularies.verb) {
    assert.ok(full(rules.event, nameOf('event', { domain: 'orders', verb }, reg)), verb);
  }
  assert.equal(rules.slice, undefined, 'no second rule for slice folders');
  for (const action of config.naming.actions) assert.ok(full(rules.permission, nameOf('permission', { domain: 'orders', action }, reg)), action);
  assert.ok(!full(rules.event, 'Acme.Shop.OrderPlaced') && !full(rules.event, 'Acme.Shop.OrderCreatedV2'), 'a verb the registry lacks, a version suffix');
  assert.ok(!full(rules.permission, 'Acme.Shop/order/write') && !full(rules.permission, 'Acme.Shop/orders/approve'));
  // find looks only at the project's own names: its namespace, in a string literal of the stack.
  assert.deepEqual(found(rules.event, 'const T = "Acme.Shop.OrderPlaced"; x := "Other.Ns.Thing"; p := "Acme.Shop/orders/read"'), ['Acme.Shop.OrderPlaced']);
  assert.deepEqual(found(rules.permission, 'p := "Acme.Shop/orders/read"; q := "Other.Ns/things/write"'), ['Acme.Shop/orders/read']);
  assert.deepEqual(rules.event.files, ['cmd/**/*.go', 'internal/**/*.go'], 'the Go pack says where');
  // table: stack-neutral, an open token, so the kind's regex.
  assert.deepEqual(found(rules.table, 'CREATE TABLE IF NOT EXISTS orders.order_lines (\ncreate unlogged table Orders.Lines(id int);'), ['orders.order_lines', 'Orders.Lines']);
  assert.ok(full(rules.table, 'orders.order_lines') && !full(rules.table, 'Orders.Lines'));
  // TypeScript says its own files; without a pack, only the stack-neutral kinds.
  const ts = Object.fromEntries(generatedRules({ naming: NAMING }, null, makeRepo({ 'tsconfig.json': '{}\n' }, { naming: NAMING })).map((r) => [r.id, r]));
  assert.deepEqual(ts.event.files, ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.mts']);
  assert.deepEqual(generatedRules({ naming: NAMING }).map((r) => r.id), ['migration', 'namespace', 'banned', 'table']);
  assert.ok(!generatedRules({ naming: { tokens: { system: 'shop' }, domains: { orders: {} } } }, null, dir).some((r) => r.id === 'event'), 'no org, no namespace to find');
});

const BOLT = {
  'internal/domains/orders/createorder/application/handler.go': 'package application\n\nconst Created = "Acme.Shop.OrderCreated"\nconst Placed = "Acme.Shop.OrderPlaced"\nconst Write = "Acme.Shop/orders/write"\nconst Bad = "Acme.Shop/order/write"\n',
  'internal/domains/orders/placeorder/application/handler.go': 'package application\n',
  'migrations/orders/0001_create_orders.sql': 'create table orders.orders (id int);\nCREATE TABLE Orders.Lines (id int);\n',
};

test('B267/AC-2 the gate refuses each misnamed event, permission and table a bolt adds, and passes every composed one', () => {
  const r = merge(setup({ profile: { ...PROFILE, naming: NAMING }, unit: { scope: ['src/**', 'tests/**', 'internal/**', 'migrations/**'] }, files: BOLT, beforeReview: (d) => commit(d, 'go module', GO) }));
  assert.ok(codes(r).includes('GATE-NAME'), r.out);
  const named = lines(r.out, 'GATE-NAME').map((l) => l.match(/ names (\S+), which does not match the (\S+) rule| (\S+) does not match the (\S+) rule/)).map((m) => (m[1] ? `${m[2]} ${m[1]}` : `${m[4]} ${m[3]}`)).sort();
  assert.deepEqual(named, ['event Acme.Shop.OrderPlaced', 'permission Acme.Shop/order/write', 'table Orders.Lines']);
});

test('B267/AC-2 check --tree runs the generated rules over every tracked file: find rules on each line', () => {
  const dir = makeRepo({ ...I1, ...GO, ...BOLT }, { naming: NAMING });
  const out = lines(run(dir, ['check', '--tree']).out, 'GATE-NAME').map((l) => l.split(' ')[0]).sort();
  assert.deepEqual(out, ['internal/domains/orders/createorder/application/handler.go:4', 'internal/domains/orders/createorder/application/handler.go:6', 'migrations/orders/0001_create_orders.sql:2']);
  assert.equal(lines(run(dir, ['check']).out, 'GATE-NAME').length, 0, 'without --tree, check leaves names to the gate');
});

test('B267/AC-3 a kind\'s max and class bound the names aidlc name prints; a global kind needs a project token; an unknown class or scope is reported', () => {
  const grammar = {
    bucket: { template: '{{system}}-{{domain}}-bucket', needs: ['system', 'domain'], regex: '^.+$', max: 12, scope: 'global' },
    vault: { template: '{{system}}_{{domain}}', needs: ['system', 'domain'], regex: '^.+$', class: 'dns-label', scope: 'region' },
    share: { template: '{{domain}}-share', needs: ['domain'], regex: '^.+$', scope: 'global' },
    odd: { template: '{{domain}}', regex: '^.+$', class: 'kebab', scope: 'planet' },
  };
  const dir = makeRepo(I1, { naming: { ...NAMING, grammar } });
  assert.match(run(dir, ['name', 'bucket', '--domain', 'orders']).err, /bucket shop-orders-bucket is 18 characters, over its max 12/);
  assert.match(run(dir, ['name', 'vault', '--domain', 'orders']).err, /vault shop_orders is not of its class dns-label/);
  assert.equal(run(dir, ['name', 'share', '--domain', 'orders']).out, 'orders-share\n', 'a warning, not a refusal');
  const out = lines(run(dir, ['check']).out, 'PROFILE-NAMING').map((l) => l.replace(/^\S+ PROFILE-NAMING /, '').replace(/ → .*\((\w+)\)$/, ' ($1)'));
  assert.deepEqual(out, [
    'naming kind share is unique globally, but its template holds none of system, org, instance: two projects could compose the same name (warning)',
    'naming kind odd has class kebab, not one of naming.classes: dns-label, lower-alnum, lower-snake (error)',
    'naming kind odd has scope planet, not one of global, region, account, group, namespace (error)',
  ]);
  assert.ok(!lines(run(makeRepo(I1, { naming: NAMING }), ['check']).out, 'PROFILE-NAMING').length, 'the plugin\'s own kinds hold');
});
