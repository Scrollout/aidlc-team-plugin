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
