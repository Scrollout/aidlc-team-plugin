// M17 B170-B172: stack packs - the graph the plugin reads from source, scaffolds, the reference domain, events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { kindFindings, layerFindings, reachFindings } from '../plugin/cli/lib/arch.mjs';
import { moduleFindings } from '../plugin/cli/lib/gate.mjs';
import { packGraph } from '../plugin/cli/lib/packs.mjs';
import { I1, U, approve, makeRepo, read, run, tempDir, unitDoc } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const GO_REF = join(ROOT, 'plugin/packs/go/reference');
const layers = (d) => Object.fromEntries(['interface', 'application', 'model', 'infrastructure'].map((l) => [l, [`internal/domains/${d}/${l}/**`]]));
const NOTES = { naming: { tokens: { system: 'ref', org: 'example' }, domains: { notes: {} } }, architecture: { data: { prefix: 'data/' }, acyclic: true }, modules: [
  { id: 'notes', kind: 'domain', paths: ['internal/domains/notes/**'], layers: layers('notes'), surfaces: { client: ['internal/domains/notes/client'], events: ['internal/domains/notes/events'], server: ['internal/domains/notes/interface'] }, data: ['data/notes/**'] },
  { id: 'notes-api', kind: 'runtime', paths: ['cmd/notes-api/**'] },
] };

test('B170/AC-1 the Go pack reads imports inside the module and data edges from migrations, with no toolchain run', () => {
  const edges = packGraph(GO_REF, NOTES).map((e) => e.join(' -> '));
  for (const e of ['cmd/notes-api -> internal/domains/notes/interface', 'internal/domains/notes/application/createnote -> internal/domains/notes/model', 'internal/domains/notes/infrastructure -> internal/domains/notes/model', 'internal/domains/notes/infrastructure -> data/notes/notes']) assert.ok(edges.includes(e), e);
  assert.ok(!edges.some((e) => /_test|context|net\/http/.test(e)), 'tests and the standard library are no edges');
});

test('B171/AC-2 the Go reference domain passes every architecture check on its own graph', () => {
  const edges = packGraph(GO_REF, NOTES);
  assert.deepEqual([...kindFindings(edges, NOTES), ...layerFindings(edges, NOTES), ...reachFindings(edges, NOTES), ...moduleFindings(edges, NOTES)].map((f) => f.message), []);
  for (const f of ['internal/domains/notes/application/createnote/handler_test.go', 'internal/domains/notes/application/getnote/handler_test.go', 'internal/domains/notes/model/note_test.go']) assert.ok(existsSync(join(GO_REF, f)), `${f}: fully tested`);
});

test('B170/AC-1 a schema-qualified table of another domain is a data edge, so ARCH-DATA sees the reach; aidlc graph prints the edges', () => {
  const dir = tempDir('graph-');
  cpSync(GO_REF, dir, { recursive: true });
  writeFileSync(join(dir, 'internal/domains/notes/infrastructure/peek.go'), 'package infrastructure\n\nconst peek = "select * from billing.invoices"\n');
  const profile = { ...NOTES, modules: [...NOTES.modules, { id: 'billing', kind: 'domain', paths: ['internal/domains/billing/**'], data: ['data/billing/**'] }] };
  const edges = packGraph(dir, profile);
  assert.ok(edges.some(([a, b]) => a === 'internal/domains/notes/infrastructure' && b === 'data/billing/invoices'));
  assert.deepEqual(moduleFindings(edges, profile).map((f) => f.code), ['ARCH-DATA']);
});

test('B170/AC-2 with a pack detected, a project graph that lacks an edge the pack reads is GRAPH-SELFTEST', () => {
  const dir = makeRepo({ ...I1, 'go.mod': 'module example.com/shop\n\ngo 1.22\n', 'cmd/shop-api/main.go': 'package main\n\nimport _ "example.com/shop/internal/foundation/config"\n\nfunc main() {}\n', 'internal/foundation/config/config.go': 'package config\n', 'graph.sh': 'echo "x -> y"\n' }, { architecture: { graph: 'sh graph.sh' } });
  assert.match(run(dir, ['check']).out, /GRAPH-SELFTEST the project's graph \(sh graph\.sh\) lacks 1 edges the stack pack reads from source, e\.g\. cmd\/shop-api -> internal\/foundation\/config/);
  writeFileSync(join(dir, '.aidlc/profile.json'), JSON.stringify({ architecture: { graph: `node ${join(ROOT, 'plugin/cli/aidlc.mjs')} graph` } }));
  assert.doesNotMatch(run(dir, ['check']).out, /GRAPH-SELFTEST/, "the plugin's own graph");
  assert.equal(run(dir, ['graph']).out, 'cmd/shop-api -> internal/foundation/config\n');
});

test('B171/AC-1 aidlc scaffold writes each kind at its folder with names from the registry, and never overwrites', () => {
  const dir = makeRepo({ ...I1, 'go.mod': 'module example.com/shop\n\ngo 1.22\n' }, { naming: { tokens: { system: 'shop' }, domains: { roleassignments: { name: 'Role assignments' } } } });
  assert.equal(run(dir, ['scaffold', 'domain', 'roleassignments']).code, 0);
  assert.match(read(dir, 'internal/domains/roleassignments/model/roleassignment.go'), /^type RoleAssignment struct \{$/m);
  assert.match(run(dir, ['scaffold', 'slice', 'create', '--domain', 'roleassignments']).out, /^wrote internal\/domains\/roleassignments\/application\/createroleassignment\/handler\.go$/m);
  assert.match(read(dir, 'internal/domains/roleassignments/application/createroleassignment/handler_test.go'), /t\.Fatal\("write the acceptance test first"\)/, 'tests first: the scaffolded test fails');
  assert.match(run(dir, ['scaffold', 'runtime', 'shop-ingress-gateway']).out, /^wrote cmd\/shop-ingress-gateway\/main\.go$/m);
  assert.match(run(dir, ['scaffold', 'domain', 'roleassignments']).out, /^kept internal\/domains\/roleassignments\/model\/roleassignment\.go: it exists$/m);
  assert.match(run(dir, ['scaffold', 'foundation', 'store']).err, /kit store is not in the registry/);
  assert.match(run(dir, ['scaffold', 'runtime', 'resource-manager-frontdoor']).err, /is not in the registry/);
  assert.match(run(makeRepo(I1, {}), ['scaffold', 'domain', 'x']).err, /no stack pack fits this project/);
});

test('B171/AC-3 an event type in a domain events surface that breaks the grammar is CONTRACT-NAME', () => {
  const ok = 'package events\n\nconst NoteCreatedType = "Example.Reference.NoteCreated"\n';
  const bad = 'package events\n\nconst NoteType = "notes.created.v2"\nconst SavedType = "Example.Reference.NoteSave"\n';
  const found = (text) => run(makeRepo({ ...I1, 'go.mod': 'module example.com/r\n\ngo 1.22\n', 'internal/domains/notes/events/events.go': text }, NOTES), ['check']).out.split('\n').filter((l) => /CONTRACT-NAME/.test(l)).map((l) => l.replace(/ → .*$/, ''));
  assert.deepEqual(found(ok), []);
  assert.deepEqual(found(bad), [
    'internal/domains/notes/events/events.go:1 CONTRACT-NAME event type notes.created.v2 is not <Org>.<Service>.<Noun><PastTenseVerb> with no version suffix',
    'internal/domains/notes/events/events.go:1 CONTRACT-NAME event type Example.Reference.NoteSave is not <Org>.<Service>.<Noun><PastTenseVerb> with no version suffix',
  ]);
});

test('B171/AC-2 a bolt that names a domain gets the reference slices on its card, and init vendors the packs', () => {
  const modules = [{ id: 'notes', kind: 'domain', paths: ['internal/domains/notes/**'] }];
  const dir = makeRepo({ ...I1, 'go.mod': 'module example.com/r\n\ngo 1.22\n', [U(1)]: unitDoc({ scope: ['internal/domains/notes/**'], modules: ['notes'] }) }, { modules });
  approve(dir, 'I-1', 'U-1');
  assert.match(run(dir, ['card', 'U-1']).out, /^## Reference\nCopy the shape of the stack pack's reference domain \(.*packs\/go\/reference\/internal\/domains\/notes\): the command slice .*createnote and the query slice .*getnote\.$/m);
  assert.equal(run(dir, ['upgrade', '--dirty']).code, 0);
  assert.ok(existsSync(join(dir, '.aidlc/packs/go/manifest.json')) && existsSync(join(dir, '.aidlc/packs/go/reference/go.mod')), 'vendored with the CLI');
  assert.equal(JSON.parse(readFileSync(join(dir, '.aidlc/packs/go/manifest.json'), 'utf8')).stack, 'go');
});

test('B172/AC-1 the TypeScript pack reads relative imports and migrations; its reference domain passes every architecture check; scaffold works the same', () => {
  const TS_REF = join(ROOT, 'plugin/packs/typescript/reference');
  const lay = (d) => Object.fromEntries(['interface', 'application', 'model', 'infrastructure'].map((l) => [l, [`src/domains/${d}/${l}/**`]]));
  const profile = { ...NOTES, modules: [{ ...NOTES.modules[0], paths: ['src/domains/notes/**'], layers: lay('notes'), surfaces: { client: ['src/domains/notes/client'], events: ['src/domains/notes/events'], server: ['src/domains/notes/interface'] } }, { id: 'notes-api', kind: 'runtime', paths: ['src/runtimes/notes-api/**'] }] };
  const edges = packGraph(TS_REF, profile), lines = edges.map((e) => e.join(' -> '));
  for (const e of ['src/runtimes/notes-api -> src/domains/notes/interface', 'src/domains/notes/application/createnote -> src/domains/notes/model', 'src/domains/notes/infrastructure -> data/notes/notes']) assert.ok(lines.includes(e), e);
  assert.ok(!lines.some((e) => /data\/notes\/(save|get|set)$/.test(e)), 'a call on a variable named like the domain is no table');
  assert.deepEqual([...kindFindings(edges, profile), ...layerFindings(edges, profile), ...reachFindings(edges, profile), ...moduleFindings(edges, profile)].map((f) => f.message), []);
  const dir = makeRepo({ ...I1, 'tsconfig.json': '{}\n' }, { naming: { tokens: { system: 'shop' }, domains: { orders: {} } } });
  assert.match(run(dir, ['scaffold', 'slice', 'create', '--domain', 'orders']).out, /^wrote src\/domains\/orders\/application\/createorder\/handler\.ts\nwrote src\/domains\/orders\/application\/createorder\/handler\.spec\.ts$/m);
  assert.match(run(dir, ['scaffold', 'domain', 'orders']).out, /^wrote src\/domains\/orders\/model\/order\.ts$/m);
  assert.match(read(dir, 'src/domains/orders/model/order.ts'), /^export interface Order \{$/m);
});
