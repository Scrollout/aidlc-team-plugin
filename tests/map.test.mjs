import { test } from 'node:test';
import assert from 'node:assert/strict';
import { git, makeRepo, read, run } from './state-repo.mjs';
import { merge, PROFILE, setup } from './gate-repo.mjs';

const GRAPH = 'node graph.mjs'; // a script file: quoting in an inline command differs between shells
const GRAPH_JS = "console.log(['src/api -> lib/db', 'src/api -> data/orders', 'lib/db -> third/x'].join('\\n'));\n";
const MODULES = [{ id: 'api', paths: ['src/api/**'], api: ['src/api'] }, { id: 'db', paths: ['lib/db/**'], data: ['data/orders'] }];

test('U88/AC-1 aidlc map writes the modules as a tree with data and public paths, a top folder no module covers, and the module dependencies', () => {
  const dir = makeRepo({ 'src/api/a.mjs': '1;\n', 'lib/db/b.mjs': '1;\n', 'scripts/c.sh': 'true\n', 'graph.mjs': GRAPH_JS }, { modules: MODULES, architecture: { graph: GRAPH } });
  const r = run(dir, ['map']);
  assert.equal(r.code, 0, r.err + r.out);
  const [map, graph, table] = ['', '-graph', '-table'].map((x) => read(dir, `docs/codebase-map${x}.md`));
  assert.match(map, /^---\ntype: Map\ntitle: Codebase map\n/);
  assert.match(map, /^\*\*TL;DR:\*\* /m, 'each page opens with a one-line summary');
  assert.match(map, /^├── lib\/\n│   └── db\/ — db · owns data\/orders\n├── scripts\/ — \(no module\)\n└── src\/\n    └── api\/ — api · public: src\/api$/m);
  assert.match(map, /^- \[Module dependencies\]\(codebase-map-graph\.md\)$/m, 'the tree links the other pages');
  assert.match(graph, /```mermaid\nflowchart LR\n  n0\[api\]\n  n1\[db\]\n  n0 --> n1\n```/, 'code edges only: the data edge and the edge out of all modules are left out');
  assert.match(table, /^\| api \| db \| - \|$/m);
  assert.match(table, /^\| db \| - \| api \|$/m);
  assert.equal(run(dir, ['map']).out, 'the codebase map is current\n', 'unchanged body, no rewrite');
  assert.equal(run(makeRepo({}, { modules: MODULES, map: false }), ['map']).out, 'the codebase map is current\n', 'map: false writes nothing');
});

test('U88/AC-2 merge writes the codebase map with the indexes, so the merge commit carries it', () => {
  const dir = setup({ profile: { ...PROFILE, modules: [{ id: 'core', paths: ['src/**'] }, { id: 'tests', paths: ['tests/**'] }] } });
  const r = merge(dir);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(read(dir, 'docs/codebase-map.md'), /── src\/ — core/);
  assert.equal(git(dir, 'status', '--porcelain'), '');
});
