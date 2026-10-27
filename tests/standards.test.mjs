// M20 B208-B212: formats that follow published standards (docs/design/standards.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, read, run } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const V2 = { system: { core: ['src/**'] }, naming: { tokens: { system: 'shop' } }, modules: [{ id: 'orders', kind: 'domain', paths: ['src/orders/**'] }] };
const decision = (body, fm = '') => `---\ntype: Decision\ntitle: 0001 Store orders\ndescription: Orders in one database.\nstatus: proposed\n${fm}generated: { by: x/1, at: 2026-10-27T00:00:00Z }\n---\n\n# Store orders\n\n${body}`;
const MADR = '## Context and Problem Statement\nWhere?\n\n## Considered Options\n* one\n* two\n\n## Decision Outcome\nChosen option: "one", because it is simplest.\n';
const schema = (dir) => run(dir, ['check', 'docs']).out.split('\n').filter((l) => /DOC-SCHEMA/.test(l)).map((l) => l.replace(/ → .*$/, ''));

test('B208/AC-1 a draft decision in a v2 project keeps MADR sections, a one-way door its Confirmation; approving stamps accepted and the date', () => {
  assert.deepEqual(schema(makeRepo({ 'docs/decisions/0001-store-orders.md': decision('## Context\nWhere?\n') }, V2)), [
    'docs/decisions/0001-store-orders.md:1 DOC-SCHEMA a draft Decision lacks its Context and Problem Statement section (MADR 4.0)',
    'docs/decisions/0001-store-orders.md:1 DOC-SCHEMA a draft Decision lacks its Considered Options section (MADR 4.0)',
    'docs/decisions/0001-store-orders.md:1 DOC-SCHEMA a draft Decision lacks its Decision Outcome section (MADR 4.0)',
  ]);
  assert.deepEqual(schema(makeRepo({ 'docs/decisions/0001-store-orders.md': decision(MADR, 'oneWayDoor: true\n') }, V2)), ['docs/decisions/0001-store-orders.md:1 DOC-SCHEMA a draft Decision lacks its Confirmation section (MADR 4.0)']);
  const dir = makeRepo({ 'docs/decisions/0001-store-orders.md': decision(MADR) }, V2);
  assert.deepEqual(schema(dir), []);
  assert.equal(run(dir, ['approve', '0001']).code, 0);
  assert.match(read(dir, 'docs/decisions/0001-store-orders.md'), new RegExp(`^status: accepted\\ndate: ${new Date().toISOString().slice(0, 10)}$`, 'm'));
  assert.deepEqual(schema(makeRepo({ 'docs/decisions/0001-store-orders.md': decision('# Decision\nKeep.\n') }, {})), [], 'a v1 project keeps its decisions');
});

test('B208/AC-2 the plugin\'s own decisions and its template are in MADR form', async () => {
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(join(ROOT, 'docs/decisions')).filter((x) => /^\d{4}-/.test(x))) {
    const text = readFileSync(join(ROOT, 'docs/decisions', f), 'utf8');
    assert.match(text, /^status: (proposed|accepted|rejected|deprecated|superseded by ADR-\d{4})$/m, f);
    assert.match(text, /^## Decision Outcome$/m, f);
  }
  assert.match(readFileSync(join(ROOT, 'plugin/templates/docs/decision.md'), 'utf8'), /^## Context and Problem Statement\n[\s\S]*^## Considered Options\n[\s\S]*^## Decision Outcome\nChosen option: /m);
});

test('B209/AC-1 B210/AC-1 in a v2 project a draft AC that is not Given/When/Then is PLAN-AC, a draft requirement not in an EARS pattern PLAN-REQ', async () => {
  const { lintPlan } = await import('../plugin/cli/lib/index.mjs');
  const req = (statement) => `---\ntype: Requirement\ntitle: Limits\ndescription: Limits.\n---\n\n# Requirement\n${statement}\n\n# Acceptance criteria\n- AC-1 (unit): Given a quota of 2, when a third order comes, then it is refused.\n- AC-2 (unit): it works.\n`;
  const bolt = '---\ntype: Bolt\ntitle: B\ndescription: B.\ndesign: "test"\nscope: ["src/orders/**"]\nmodules: [orders]\nrequirements: [R-1]\n---\n\n# Acceptance criteria\n- AC-1 (unit): Given an order, when it is placed, then it is stored.\n- AC-2 (unit): orders are stored.\n';
  const found = (statement, profile = V2) => lintPlan(join(makeRepo({ 'docs/requirements/R-1-limits.md': req(statement), 'docs/bolts/B-1-b.md': bolt }, profile), 'docs'), profile, {})
    .filter((f) => /Given\/When\/Then|EARS/.test(f.message)).map((f) => `${f.code} ${f.message.split(':')[0]}`);
  assert.deepEqual(found('Orders are limited.'), ['PLAN-AC B-1 AC-2 is not Given/When/Then', 'PLAN-AC R-1 AC-2 is not Given/When/Then', 'PLAN-REQ R-1 states no requirement in an EARS pattern under # Requirement']);
  assert.deepEqual(found('When a customer has 2 open orders, the shop shall refuse a third.').filter((l) => /PLAN-REQ/.test(l)), []);
  assert.deepEqual(found('Orders are limited.', {}), [], 'a v1 project keeps its formats');
});

test('B212/AC-1 a draft system doc in a v2 project follows arc42\'s twelve sections; the generated maps name their C4 level', async () => {
  const { config } = await import('../plugin/cli/lib/index.mjs');
  const sys = (headings) => `---\ntype: System\ntitle: Shop\ndescription: The shop.\ngenerated: { by: x/1, at: 2026-10-27T00:00:00Z }\n---\n\n${headings.map((h) => `# ${h}\nx\n`).join('\n')}`;
  const all = config.okf.bundle.schemas.System.sections;
  assert.equal(all.length, 12);
  assert.deepEqual(schema(makeRepo({ 'docs/system/shop.md': sys(all) }, V2)), []);
  assert.deepEqual(schema(makeRepo({ 'docs/system/shop.md': sys(all.filter((h) => h !== 'Runtime View')) }, V2)), ['docs/system/shop.md:1 DOC-SCHEMA a draft System lacks its Runtime View section (arc42)']);
  assert.ok(config.map.pages.filter((p) => /C4 component view/.test(p.description)).length >= 2);
});

test('B212/AC-2 the plugin\'s architecture page has arc42\'s twelve sections in order, and the CLI a generated C4 component view', async () => {
  const { config } = await import('../plugin/cli/lib/index.mjs');
  const text = readFileSync(join(ROOT, 'docs/design/arc42.md'), 'utf8');
  assert.deepEqual([...text.matchAll(/^# (.*)$/gm)].map((m) => m[1]), config.okf.bundle.schemas.System.sections);
  assert.match(readFileSync(join(ROOT, 'docs/design/diagrams/cli-components.md'), 'utf8'), /C4 component view[\s\S]*extensions --> entry/);
});

test('a draft decision\'s status is one MADR names; approving fills decision-makers with the approver only when none is named', () => {
  assert.deepEqual(schema(makeRepo({ 'docs/decisions/0001-store-orders.md': decision(MADR).replace('status: proposed', 'status: approved') }, V2)),
    ['docs/decisions/0001-store-orders.md:1 DOC-SCHEMA a draft Decision\'s status is approved, which MADR 4.0 does not name: proposed, rejected, accepted, deprecated or superseded by ADR-<NNNN>']);
  const dir = makeRepo({ 'docs/decisions/0001-store-orders.md': decision(MADR), 'docs/decisions/0002-keep-orders.md': decision(MADR, 'decision-makers: the architecture board\n').replace('0001 Store orders', '0002 Keep orders') }, V2);
  assert.equal(run(dir, ['approve', '0001', '0002']).code, 0);
  assert.match(read(dir, 'docs/decisions/0001-store-orders.md'), /^decision-makers: owner@example\.com$/m, 'the approver, without the human: prefix');
  const kept = read(dir, 'docs/decisions/0002-keep-orders.md');
  assert.match(kept, /^decision-makers: the architecture board$/m);
  assert.equal(kept.match(/^decision-makers:/gm).length, 1, 'a named one stays, never doubled');
});
