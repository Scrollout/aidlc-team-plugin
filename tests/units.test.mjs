// M27 B243: an intent's units of work, as the method's Mob Elaboration and Units Generation give them
// (docs/design/units-of-work.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../plugin/cli/lib/index.mjs';
import { makeRepo, run } from './state-repo.mjs';

const V2 = { system: { core: ['src/**'] }, modules: [{ id: 'orders', kind: 'domain', paths: ['src/orders/**'] }, { id: 'payments', kind: 'domain', paths: ['src/payments/**'] }, { id: 'gateway', kind: 'runtime', paths: ['src/gateway/**'] }] };
const unit = (name, parts) => `## ${name}\n${Object.entries(parts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n`;
const ORDERS = { Kind: 'service', Modules: 'orders, gateway', Responsibilities: 'takes cake orders [Q-1.1]', Stories: 'US1.1', Requirements: 'R-1', Risks: 'an order lost between steps', Measures: 'every order confirmed in a minute [M1]', 'Depends on': 'payments' };
const PAYMENTS = { Kind: 'service', Modules: 'payments', Responsibilities: 'charges the card [Q-1.2]', Stories: 'US1.2', Requirements: 'R-1', Risks: 'a charge made twice', Measures: 'no double charge [M1]', 'Depends on': 'none' };
// Method 11's rules (B243) on an intent pinned to it; method 12 adds each Unit's slices (B248, below).
const intent = (units, stories = '- US1.1 As a customer, I want to order a cake, so that I get it on time. R-1 [Q-1.1]\n- US1.2 As a customer, I want to pay by card, so that I need no cash. R-1 [Q-1.2]\n', method = 11) =>
  `---\ntype: Intent\ntitle: Cake orders\ndescription: Customers order cakes.\npathway: feature\nrequirements: [R-1]\nmethod: ${method}\n---\n\n# Goal\n- Customers order cakes online [Q-1.1]\n\n# Stories\n${stories}\n# Units\n${units}\n# Success measures\n- M1 orders confirmed within a minute\n`;
const req = '---\ntype: Requirement\ntitle: Orders\ndescription: Orders are taken.\n---\n\n# Requirement\nThe shop shall take orders.\n';
const bolt = (modules) => `---\ntype: Bolt\ntitle: Take orders\ndescription: Take orders.\nintent: I-1\nmodules: [${modules}]\nscope: ["src/orders/**"]\n---\n\n# Why\nOrders.\n`;
const found = (docs) => run(makeRepo({ 'docs/requirements/R-1-orders.md': req, ...docs }, V2), ['check']).out.split('\n').filter((l) => /UNIT-WORK/.test(l)).map((l) => l.replace(/ → .*$/, '').replace(/^\S+:\d+ UNIT-WORK /, ''));

test('B243/AC-1 an intent lists its units of work, each with every needed part, its kind, modules and requirements known', () => {
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': intent(unit('orders', ORDERS) + unit('payments', PAYMENTS)) }), [], 'both units whole');
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': intent('') }), ['I-1 lists no unit of work under # Units']);
  const { Risks, ...noRisks } = ORDERS;
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': intent(unit('Orders', { ...noRisks, Kind: 'daemon', Modules: 'orders, billing', Requirements: 'R-1, R-9', Measures: 'fast' }) + unit('payments', PAYMENTS)) }), [
    'I-1 unit of work Orders is not a lower-case path segment',
    'I-1 unit of work Orders has no Risks line',
    'I-1 unit of work Orders has kind daemon, not one of service, spec, ui, packaging, library',
    'I-1 unit of work Orders changes billing, which is no module of the profile',
    'I-1 unit of work Orders cites R-9, which the intent does not cite',
    'I-1 unit of work Orders measure cites no success measure of the intent: fast',
  ]);
});

test('B243/AC-2 every story has an id and a unit, every unit a story, the dependencies no circle, and each bolt\'s modules a unit', () => {
  const story = '- US1.1 As a customer, I want to order a cake, so that I get it on time. R-1 [Q-1.1]\n- As a customer, I want a receipt, so that I can claim it. R-1 [Q-1.1]\n- US1.2 As a customer, I want to pay by card, so that I need no cash. R-1 [Q-1.2]\n- US1.3 As a customer, I want a refund, so that a wrong cake costs nothing. R-1 [Q-1.2]\n';
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': intent(unit('orders', { ...ORDERS, Stories: 'US1.1, US1.9' }) + unit('payments', { ...PAYMENTS, Stories: '-', 'Depends on': 'orders' }), story) }), [
    'I-1 story has no id US<g>.<s>: - As a customer, I want a receipt, so that I can claim it.…',
    'I-1 unit of work orders lists US1.9, which is no story of the intent',
    'I-1 unit of work payments lists no story',
    'I-1 story US1.2 is in no unit of work',
    'I-1 story US1.3 is in no unit of work',
    'I-1 units of work depend on each other in a circle: orders -> payments -> orders',
  ]);
  const both = intent(unit('orders', { ...ORDERS, Stories: 'US1.1, US1.2' }) + unit('payments', PAYMENTS));
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': both }), [], 'a story may cross units');
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': both, 'docs/bolts/B-1-take-orders.md': bolt('orders') }), [], 'a bolt inside a unit');
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': intent(unit('orders', { ...ORDERS, Modules: 'orders' }) + unit('payments', PAYMENTS)), 'docs/bolts/B-1-take-orders.md': bolt('orders, gateway') }), ['I-1 bolt B-1 changes gateway, which no unit of work lists']);
  assert.ok(config.state.approveBlocks.includes('UNIT-WORK'), 'it blocks the approval, as the other elaboration checks do');
});

// M28 B248: each Unit names the slices that serve its stories (docs/design/vertical-slices.md#planned-before-built).
const SLICED = (orders, payments) => intent(unit('orders', { ...ORDERS, Slices: orders }) + unit('payments', { ...PAYMENTS, Slices: payments }), undefined, 12);
const foundWith = (profile, docs) => run(makeRepo({ 'docs/requirements/R-1-orders.md': req, ...docs }, profile), ['check']).out.split('\n').filter((l) => /UNIT-WORK/.test(l)).map((l) => l.replace(/ → .*$/, '').replace(/^\S+:\d+ UNIT-WORK /, ''));

test('B248/AC-1 from method 12 each Unit names the slices that serve its stories, each citing a story of the Unit', () => {
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': SLICED('Command createorder [US1.1]', 'Command createpayment [US1.2]') }), [], 'every story served');
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': intent(unit('orders', ORDERS) + unit('payments', { ...PAYMENTS, Slices: 'Command createpayment [US1.2]' }), undefined, 12) }), ['I-1 unit of work orders has no Slices line']);
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': SLICED('Event ordertaken [US1.1], Query getorder [], Command createorder [US1.2]', 'Command createpayment [US1.2]') }), [
    'I-1 unit of work orders: slice ordertaken has kind Event, not one of Command, Query',
    'I-1 unit of work orders: slice getorder cites no story of the unit of work in brackets',
    'I-1 unit of work orders: slice createorder cites US1.2, which is no story of the unit of work',
  ]);
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': SLICED('Query getorder []', 'Command createpayment [US1.2]') }).filter((l) => /story US1\.1/.test(l)),
    ['I-1 unit of work orders: story US1.1 has no slice under Slices: name the vertical slice that serves it, <Kind> <slice> [US1.1]']);
  assert.deepEqual(found({ 'docs/intents/I-1-cakes.md': intent(unit('orders', ORDERS) + unit('payments', PAYMENTS)) }), [], 'an intent pinned to method 11 needs no slices');
  // A Unit with no domain module is horizontal work: its stories need no slice; a domain's Unit still does.
  const kinds = { ...V2, modules: [...V2.modules.map((m) => (m.id === 'payments' ? { ...m, kind: 'foundation' } : m))] };
  assert.deepEqual(foundWith(kinds, { 'docs/intents/I-1-cakes.md': SLICED('Command createorder [US1.1]', 'none: a shared kit') }), [], 'horizontal work serves its stories without slices');
});

test('B248/AC-1 with a naming registry, a Unit\'s slice is a name the registry composes from its verbs and the Unit\'s domains', () => {
  const named = { ...V2, naming: { tokens: { system: 'shop' }, domains: { orders: {}, payments: {} } } };
  assert.deepEqual(foundWith(named, { 'docs/intents/I-1-cakes.md': SLICED('Command createorder [US1.1]', 'Command createpayment [US1.2]') }), []);
  const lines = foundWith(named, { 'docs/intents/I-1-cakes.md': SLICED('Command placeorder [US1.1]', 'Command createorder [US1.2]') });
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /^I-1 unit of work orders: slice placeorder is no name the naming registry composes from its verbs and the domains of the unit of work \(getorder, listorder, createorder, /);
  assert.match(lines[1], /slice createorder is no name .*\(getpayment, /, 'a slice of another Unit\'s domain');
});

test('B248/AC-2 intake lists a fitting model\'s slices; the persona and the intent template carry the Slices part', async () => {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = makeRepo({}, V2);
  mkdirSync(join(dir, '.aidlc/models/shop'), { recursive: true });
  writeFileSync(join(dir, '.aidlc/models/shop/model.json'), JSON.stringify({ name: 'shop', title: 'Shop', description: 'A shop.', layers: [{ id: 'web', kind: 'runtime' }], domains: [{ id: 'orders', kind: 'domain', slices: [{ kind: 'Command', verb: 'create', useCase: 'a customer orders' }] }], extension: { declares: [] }, rules: [], fit: { words: ['cakes'] } }));
  assert.match(run(dir, ['intake', 'Customers order cakes online.']).out, /models that fit: shop \(Q-1\.1; its slices: Command createorder\)/);
  const root = join(import.meta.dirname, '..');
  assert.match(readFileSync(join(root, 'plugin/templates/docs/intent.md'), 'utf8'), /^- Slices: <Command or Query> <slice> (\(.*?\) )?\[US<g>\.<s>\]/m);
  assert.match(readFileSync(join(root, 'plugin/personas/product-analyst.md'), 'utf8'), /the vertical slices that serve its stories/);
});

// M29 B250: from method 13 a slice declares the layers it cuts and what it reaches (docs/design/slice-method.md#one-grammar).
const OWNED = { ...V2, modules: [{ id: 'orders', kind: 'domain', paths: ['src/orders/**'], data: ['data/orders/*'] }, { id: 'payments', kind: 'domain', paths: ['src/payments/**'], data: ['data/payments/*'] }, { id: 'gateway', kind: 'runtime', paths: ['src/gateway/**'] }], architecture: { data: { prefix: 'data/', shared: ['data/outbox'] } } };
const DOMAIN = (code, events) => `---\ntype: Domain\ntitle: ${code}\ndescription: ${code}.\ncode: ${code}\nkind: domain\n---\n\n# Surface\n- Events: ${events}\n`;
const DECLARED = (orders, payments) => ({ 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'docs/domains/orders.md': DOMAIN('orders', 'OrderCreated'), 'docs/domains/payments.md': DOMAIN('payments', 'PaymentTaken'),
  'docs/intents/I-1-cakes.md': intent(unit('orders', { ...ORDERS, Slices: orders }) + unit('payments', { ...PAYMENTS, Slices: payments }), undefined, 13) });

test('B250/AC-2 from method 13 a Unit\'s slice declares its cuts, data, entry, events and calls, each one the profile, the pack and the domain docs know', () => {
  assert.deepEqual(foundWith(OWNED, DECLARED('Command createorder (interface, application, model, infrastructure, migration; data data/orders/orders, data/outbox; entry gateway; emits OrderCreated.v1) [US1.1]',
    'Command createpayment (interface, application; async; calls orders; consumes OrderCreated.v1) [US1.2]')), [], 'every part known');
  assert.deepEqual(foundWith(OWNED, DECLARED('Command createorder [US1.1]', 'Command createpayment (ui.web, interface; data data/orders/orders; entry orders; calls billing; emits OrderTaken; consumes Nothing; bogus x) [US1.2]')), [
    'I-1 unit of work orders: slice createorder does not say which layers it cuts: from method 13 it reads <Kind> <slice> (<cut>, …; data …; entry …)',
    'I-1 unit of work payments: slice createpayment cuts ui.web, a layer the stack pack does not have (it has ui.cli, ui.template, interface, application, model, infrastructure, migration)',
    'I-1 unit of work payments: slice createpayment declares bogus, which is no part of a slice\'s declaration (data, entry, permission, async, emits, consumes, calls)',
    'I-1 unit of work payments: slice createpayment uses data/orders/orders, which payments neither owns nor shares',
    'I-1 unit of work payments: slice createpayment is served by orders, which is no runtime module',
    'I-1 unit of work payments: slice createpayment emits OrderTaken, which payments\'s # Surface lists on no `- Events:` line',
    'I-1 unit of work payments: slice createpayment consumes Nothing, which no domain\'s # Surface lists on an `- Events:` line',
    'I-1 unit of work payments: slice createpayment calls billing, which is no domain, extension or adapter module',
  ]);
  assert.deepEqual(foundWith(OWNED, { ...DECLARED('Command createorder [US1.1]', 'Command createpayment [US1.2]'), 'docs/intents/I-1-cakes.md': SLICED('Command createorder [US1.1]', 'Command createpayment [US1.2]') }), [], 'an intent pinned to method 12 declares none');
});
