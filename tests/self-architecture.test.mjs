// M20 B207: the CLI follows the architecture it holds projects to (docs/design/library.md#rules).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindFindings, layerFindings, moduleFindings } from '../plugin/cli/lib/index.mjs';
import { cliEdges, cliFiles } from './diagrams.mjs';

const ROOT = join(import.meta.dirname, '..');
const CLI = 'plugin/cli';
const files = cliFiles(), edges = cliEdges();
// A module per file: kits are foundation, domains publish their exports, the entry is the core's published contract,
// the CLI and the hook rules are runtimes, and each extension folder is one extension.
const kindOf = (f) => (f.includes('/lib/foundation/') ? 'foundation' : f.includes('/lib/domains/') || f.endsWith('/lib/index.mjs') ? 'domain'
  : f.includes('/extensions/') ? 'extension' : 'runtime');
const modules = [
  ...files.filter((f) => !f.includes('/extensions/')).map((f) => ({ id: f, kind: kindOf(f), paths: [f], ...(kindOf(f) === 'domain' && { surfaces: { client: [f] } }) })),
  ...readdirSync(join(ROOT, CLI, 'extensions')).map((x) => ({ id: x, kind: 'extension', paths: [`${CLI}/extensions/${x}/**`] })),
];
const profile = { system: { core: [`${CLI}/lib/**`], extensions: [`${CLI}/extensions/**`] }, modules, architecture: { acyclic: true } };

test('B207/AC-1 the CLI passes ARCH-KIND, ARCH-LAYER and ARCH-CYCLE on its own file graph', () => {
  assert.ok(edges.length > 100, `read ${edges.length} imports`);
  assert.deepEqual([...kindFindings(edges, profile), ...layerFindings(edges, profile), ...moduleFindings(edges, profile)].map((f) => f.message), []);
});

test('B207/AC-1 the self-check sees a violation: a kit importing a domain, an extension a domain\'s internals, a cycle', () => {
  const kit = `${CLI}/lib/foundation/data.mjs`, flow = `${CLI}/lib/domains/flow.mjs`;
  const bad = [...edges, [kit, flow], [`${CLI}/extensions/board/index.mjs`, `${CLI}/lib/foundation/x/../../domains/gate.mjs`.replace('foundation/x/../../', '')], [flow, kit]];
  const codes = [...kindFindings(bad, profile), ...moduleFindings(bad, profile)].map((f) => f.code);
  assert.ok(codes.includes('ARCH-KIND') && codes.includes('ARCH-CYCLE'), codes.join(', '));
});
