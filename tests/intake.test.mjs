// M22: plain prose in (docs/design/intake.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeLane, readPlan } from '../plugin/cli/lib/index.mjs';
import { approve, commit, makeRepo, read, run, write } from './state-repo.mjs';

const PROSE = `I run a small bakery and want customers to order cakes online. They should pay by credit card when they order!

Each customer has a login.
- I get an email for each order
- Old orders are deleted after a year`;
const requestFile = (dir) => `docs/requests/${readdirSync(join(dir, 'docs/requests')).find((f) => f.startsWith('Q-1-'))}`;
const docCodes = (dir) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => /DOC-/.test(l));

test('B214/AC-1 intake keeps the request word for word with sentence ids, and a hand edit is DOC-GENERATED', () => {
  const dir = makeRepo();
  const r = run(dir, ['intake', PROSE]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^wrote docs\/requests\/Q-1-i-run-a-small-bakery-and-want-customers\.md: 5 sentences, Q-1\.1 to Q-1\.5\n/);
  const text = read(dir, requestFile(dir));
  assert.match(text, /^type: Request$/m);
  assert.match(text, /\n# Request\n- Q-1\.1 I run a small bakery and want customers to order cakes online\.\n- Q-1\.2 They should pay by credit card when they order!\n\n- Q-1\.3 Each customer has a login\.\n- Q-1\.4 I get an email for each order\n- Q-1\.5 Old orders are deleted after a year\n$/, 'paragraphs stay apart, list markers drop');
  assert.deepEqual(docCodes(dir), [], 'the CLI wrote it');
  writeFileSync(join(dir, requestFile(dir)), text.replace('- Q-1.1 I run a small', '- Q-1.1 I run a large'));
  assert.match(docCodes(dir).join('\n'), /DOC-GENERATED this Request is written only by the CLI, and its body no longer matches its digest/);
  assert.match(run(dir, ['intake', 'More.']).out, /^wrote docs\/requests\/Q-2-more\.md: 1 sentences, Q-2\.1 to Q-2\.1/, 'the next request takes the next number');
  assert.equal(run(dir, ['intake']).code, 64);
  assert.equal(run(dir, ['intake', '   ']).code, 64);
});

test('B214/AC-2 intake proposes pathway, stack and lane from bands; the lead scores the rest, citing sentences', () => {
  const dir = makeRepo();
  let r = run(dir, ['intake', PROSE]);
  assert.match(r.out, /\nproposal: pathway greenfield \(no code outside the docs\), stack none, lane full\n  verification high: a test level that runs: no; CI: no\n  risk high: money in Q-1\.2; security in Q-1\.3; deletion in Q-1\.5\n  ambiguity, assumptions not scored: aidlc intake Q-1 --<factor> <band>:<sentence ids>\n/);
  assert.match(read(dir, requestFile(dir)), /^bands: \{ verification: high, risk: high \}\ncites: \{ risk: \[Q-1\.2, Q-1\.3, Q-1\.5\] \}\nproposal: \{ pathway: greenfield, stack: none, lane: full \}$/m);
  r = run(dir, ['intake', 'Q-1', '--ambiguity', 'medium:Q-1.1', '--assumptions', 'high:Q-1.4,Q-1.5']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /  ambiguity medium: the lead, citing Q-1\.1\n  assumptions high: the lead, citing Q-1\.4, Q-1\.5\n/);
  assert.match(read(dir, requestFile(dir)), /^bands: \{ verification: high, risk: high, ambiguity: medium, assumptions: high \}$/m);
  assert.deepEqual(docCodes(dir), [], 'scoring changes only the front matter');
  assert.match(run(dir, ['intake', 'Q-1', '--risk', 'low']).err, /risk low is below what the request's words show \(high\)/);
  assert.match(run(dir, ['intake', 'Q-1', '--ambiguity', 'high']).err, /ambiguity high cites no sentence/);
  assert.match(run(dir, ['intake', 'Q-1', '--ambiguity', 'high:Q-1.9']).err, /ambiguity cites Q-1\.9, not a sentence of Q-1/);
  assert.match(run(dir, ['intake', 'Q-1', '--ambiguity', 'huge:Q-1.1']).err, /ambiguity huge:Q-1\.1: write <band>:<ids>/);
  assert.match(run(dir, ['intake', 'Q-7']).err, /no request Q-7 in docs\/requests/);
  r = run(dir, ['intake', 'Q-1', '--ambiguity', 'low']);
  assert.match(r.out, /assumptions high: the lead, citing Q-1\.4, Q-1\.5/, 'an earlier score stays');

  // Code with tests and CI and no approved intent: brownfield; a plain request stays standard.
  const brown = makeRepo({ 'src/app.js': 'x\n', '.github/workflows/ci.yml': 'on: push\n' }, { levels: { unit: { run: 'node --test', paths: ['tests/**'] } } });
  r = run(brown, ['intake', 'Show the weekly sales on the front page.']);
  assert.match(r.out, /proposal: pathway brownfield \(code, and no approved intent\), stack none, lane standard\n  verification low: a test level that runs: yes; CI: yes\n  risk low: no risk words\n/);
  commit(brown, 'an intent', { 'docs/intents/I-1-sales.md': '---\ntype: Intent\ntitle: Sales\ndescription: Sales.\n---\n\n# Goal\nx\n' });
  approve(brown, 'I-1');
  assert.match(run(brown, ['intake', 'Add a total.']).out, /pathway feature \(approved intents\)/);
  assert.match(run(makeRepo({ 'go.mod': 'module x\n', 'main.go': 'package main\n' }), ['intake', 'Hello.']).out, /stack go/, 'the stack pack the files match');
});

test('B214/AC-3 an intent\'s lane is a floor for its bolts, and a lane outside the lanes is DOC-SCHEMA', () => {
  const bolt = '---\ntype: Bolt\ntitle: Copy\ndescription: Copy.\nintent: I-1\nscope: ["src/**"]\n---\n\n- AC-1 (unit): it works.\n';
  const dir = makeRepo({ 'docs/intents/I-1-sales.md': '---\ntype: Intent\ntitle: Sales\ndescription: Sales.\nlane: full\n---\n\n# Goal\nx\n', 'docs/bolts/B-1-copy.md': bolt });
  const unit = readPlan(join(dir, 'docs')).units[0];
  assert.equal(unit.floor, 'full');
  assert.deepEqual(computeLane(unit.scope, {}, { floor: unit.floor }), { lane: 'full', reason: "its intent's lane is full, a floor over standard" });
  assert.equal(computeLane(unit.scope, {}, { floor: 'quick' }).lane, 'standard', 'a floor never lowers');
  assert.match(run(dir, ['lane', 'B-1']).out, /^full its intent's lane is full/);
  writeFileSync(join(dir, 'docs/intents/I-1-sales.md'), read(dir, 'docs/intents/I-1-sales.md').replace('lane: full', 'lane: huge'));
  assert.match(run(dir, ['check', 'docs']).out, /DOC-SCHEMA a Intent's lane is huge, not one of quick, standard, full/);
});

const V2 = { system: { core: ['src/**'] }, naming: { tokens: { system: 'bak' } } };
const cakes = (fm, body) => `---\ntype: Intent\ntitle: Cake orders\ndescription: Online cake orders.\npathway: greenfield\n${fm}---\n\n# Goal\n${body}\n\n# Questions\n- Q1 Which card provider?\n  - a) one provider: simple\n  - Answer: a\n\n# Assumptions\n- A1 One bakery, one shop.\n\n# Out of scope\n- Logins for staff [Q-1.3]: later.\n`;
const R1 = (statement) => `---\ntype: Requirement\ntitle: Order email\ndescription: The baker hears of each order.\n---\n\n# Requirement\n${statement}\n\n# Acceptance criteria\n- AC-1 (unit): Given an order, when it is placed, then the baker gets an email.\n`;
const claims = (dir) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => /CLAIM-SOURCE|REQUEST-COVERAGE/.test(l)).map((l) => l.replace(/ → .*$/, '').replace(/^docs\//, ''));

test('B215/AC-1 a method 6 intent names its requests, and its goal, stories and draft requirements cite sources that resolve (CLAIM-SOURCE)', () => {
  const dir = makeRepo({}, V2);
  run(dir, ['intake', PROSE]);
  const goal = 'Customers order cakes online [Q-1.1].\nThey pay by card [Q-1.2, Q1], in one shop [A1].';
  write(dir, { 'docs/intents/I-1-cake-orders.md': cakes('request: [Q-1]\nrequirements: [R-1]\n', goal), 'docs/requirements/R-1-order-email.md': R1('When a customer orders, the bakery system shall email the baker [Q-1.4, Q-1.5].') });
  assert.deepEqual(claims(dir), [], 'every claim sourced, every sentence cited');
  write(dir, { 'docs/intents/I-1-cake-orders.md': cakes('request: [Q-1]\nrequirements: [R-1]\n', `${goal}\nFast checkout.\nCakes [Q-1.9], cards [Q7], shops [A2], ovens [F-3].`) });
  assert.deepEqual(claims(dir), [
    'intents/I-1-cake-orders.md:13 CLAIM-SOURCE I-1 Goal line has no source: Fast checkout.',
    'intents/I-1-cake-orders.md:14 CLAIM-SOURCE I-1 cites Q-1.9, which is no sentence of its requests (Q-1)',
    'intents/I-1-cake-orders.md:14 CLAIM-SOURCE I-1 cites Q7, which is no answered question of I-1',
    'intents/I-1-cake-orders.md:14 CLAIM-SOURCE I-1 cites A2, which I-1 does not list under # Assumptions',
    'intents/I-1-cake-orders.md:14 CLAIM-SOURCE I-1 cites F-3, which is no platform fact',
  ]);
  write(dir, { 'docs/intents/I-1-cake-orders.md': cakes('request: [Q-1]\nrequirements: [R-1]\n', goal), 'docs/requirements/R-1-order-email.md': R1('When a customer orders, the bakery system shall email the baker.') });
  assert.deepEqual(claims(dir), [
    'requirements/R-1-order-email.md:8 CLAIM-SOURCE R-1 Requirement line has no source: When a customer orders, the bakery system shall email the…',
    'intents/I-1-cake-orders.md:6 REQUEST-COVERAGE I-1 leaves Q-1.4, Q-1.5 of Q-1 uncited',
  ]);
  commit(dir, 'plan');
  assert.match(run(dir, ['approve', 'R-1']).err, /CLAIM-SOURCE R-1 Requirement line has no source/, 'it blocks the approval');
  write(dir, { 'docs/intents/I-1-cake-orders.md': cakes('', goal) });
  assert.deepEqual(claims(dir), ["intents/I-1-cake-orders.md:1 CLAIM-SOURCE I-1 names no request: keep the owner's words with aidlc intake and record request: [Q-<n>]"]);
  write(dir, { 'docs/intents/I-1-cake-orders.md': cakes('request: [Q-9]\n', goal) });
  assert.match(claims(dir).join('\n'), /CLAIM-SOURCE I-1 names Q-9, which is no request in requests/);
  write(dir, { 'docs/intents/I-1-cake-orders.md': cakes('method: 5\n', 'Anything.') });
  assert.deepEqual(claims(dir), [], 'an intent of an earlier method keeps its rules');
});

test('B215/AC-2 a request sentence neither the intent nor its requirements cite is REQUEST-COVERAGE, and it blocks the approval', () => {
  const dir = makeRepo({}, V2);
  run(dir, ['intake', PROSE]);
  commit(dir, 'plan', { 'docs/intents/I-1-cake-orders.md': cakes('request: [Q-1]\n', 'Customers order cakes online [Q-1.1].') });
  assert.deepEqual(claims(dir), ['intents/I-1-cake-orders.md:6 REQUEST-COVERAGE I-1 leaves Q-1.2, Q-1.4, Q-1.5 of Q-1 uncited'], 'the out-of-scope line covers Q-1.3');
  const r = run(dir, ['approve', 'I-1']);
  assert.equal(r.code, 64);
  assert.match(r.err, /REQUEST-COVERAGE I-1 leaves Q-1\.2, Q-1\.4, Q-1\.5 of Q-1 uncited/);
});
