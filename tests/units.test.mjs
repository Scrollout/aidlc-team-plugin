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
const intent = (units, stories = '- US1.1 As a customer, I want to order a cake, so that I get it on time. R-1 [Q-1.1]\n- US1.2 As a customer, I want to pay by card, so that I need no cash. R-1 [Q-1.2]\n') =>
  `---\ntype: Intent\ntitle: Cake orders\ndescription: Customers order cakes.\npathway: feature\nrequirements: [R-1]\n---\n\n# Goal\n- Customers order cakes online [Q-1.1]\n\n# Stories\n${stories}\n# Units\n${units}\n# Success measures\n- M1 orders confirmed within a minute\n`;
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
