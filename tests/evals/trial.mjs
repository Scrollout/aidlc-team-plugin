// A scripted trial run: a small project whose plan a test owner approves, with two units
// built as a builder left them and one for a real builder, so a headless lead meets the cases a planned intent
// rarely reaches. The owner's steps are this script's, never an agent's. Run manually:
//   node tests/evals/trial.mjs setup <dir>          builds the project, approves the plan as owner@example.com
//   node tests/evals/trial.mjs approve <dir> <doc>… an owner step the lead asks for, as the test owner
//   node tests/evals/trial.mjs score <dir>          lists each case as seen or not seen
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CLI = join(import.meta.dirname, '..', '..', 'plugin/cli/aidlc.mjs');

const fm = (fields) => `---\n${Object.entries({ ...fields, generated: '{ by: evals/trial, at: 2026-10-23T00:00:00Z }' }).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;

const PROFILE = {
  modules: [{ id: 'app', paths: ['src/**', 'auth/**', 'db/**', 'api/**', 'tests/**'], check: 'node --test' }],
  levels: { unit: { paths: ['tests/**'], run: 'node --test' } },
  lanes: { quick: ['docs/**'], full: ['api/**'] },
  focus: { security: ['auth/**'], data: ['db/**'] },
};

const BASE = {
  '.aidlc/rules/data.md': '# Data rules\nEvery column in `db/schema.sql` ends its line with a `-- <what it holds>` comment.\n',
  'auth/roles.mjs': "export function isAdmin(user) {\n  return user?.roles?.includes('admin') === true;\n}\n",
  'db/schema.sql': 'CREATE TABLE users (\n  id INTEGER PRIMARY KEY, -- the user\n  email TEXT NOT NULL -- the login\n);\n',
  'src/rows.mjs': "export const ROWS = [{ id: 1 }, { id: 2 }, { id: 3 }];\n",
  'api/openapi.yaml': 'openapi: 3.1.0\ninfo: { title: Trial, version: 1.0.0 }\npaths:\n  /stats:\n    get:\n      responses:\n        "200": { description: "{ total }: the number of rows" }\n',
  'tests/base.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { isAdmin } from '../auth/roles.mjs';\n\ntest('admins are admins', () => assert.equal(isAdmin({ roles: ['admin'] }), true));\n",
  'docs/architecture/stats-api.md': fm({ type: 'Design', title: 'Stats API', description: 'The response of GET /stats.' })
    + '\n# Response\n`GET /stats` returns `{ total }`, the number of rows. Renaming the field is a one-way door: clients read it.\n',
  'docs/intents/I-1-exports.md': fm({ type: 'Intent', title: 'Exports and stats', description: 'Admins export rows; anyone reads the row count.' })
    + '\n# Goal\nAdmins export rows and log each export; the API reports how many rows there are.\n\n# Why\nSupport counts rows by hand.\n\n# Success measures\n- No manual counts.\n',
  // U34: the security part is right; the data part breaks the data rule only its reviewer reads.
  'docs/units/U-1-export.md': fm({ type: 'Unit', title: 'Logged export', description: 'Admins export rows and each export is logged.', intent: 'I-1', modules: '[app]', scope: '["src/export.mjs", "auth/roles.mjs", "db/schema.sql", "tests/export*"]' })
    + '\n# Why\nExports must be traceable.\n\n# Acceptance criteria\n- AC-1 (unit): exportRows(user) returns ROWS for an admin.\n- AC-2 (unit): exportRows(user) throws Forbidden for anyone else.\n- AC-3 (unit): db/schema.sql adds an exports table with id, user_id and at columns.\n',
  // U38: the AC contradicts the interface it links; the builder followed the AC.
  'docs/units/U-2-stats.md': fm({ type: 'Unit', title: 'Row count', description: 'GET /stats reports the row count.', intent: 'I-1', modules: '[app]', scope: '["src/stats.mjs", "tests/stats*"]' })
    + '\n# Why\nSupport asks for the count.\n\n# Acceptance criteria\n- AC-1 (unit): stats() returns `{ count }` with the number of rows.\n\n# Interfaces\n- [Stats API](../architecture/stats-api.md)\n',
  // U37: a one-way door; the decision is linked from the bundle root once the check asked for it.
  'docs/decisions/0001-health-endpoint.md': fm({ type: 'Decision', title: '0001 A public health endpoint', description: 'The API declares GET /health.' })
    + '\n# Context\nProbes need a path.\n\n# Options\n1. GET /health, public.\n2. No endpoint; probes call /stats.\n\n# Decision\nOption 1, by the test owner.\n\n# Why\nProbes must not count rows.\n\n# Revisit when\nAuth is added to the API.\n',
  'docs/units/U-3-health.md': fm({ type: 'Unit', title: 'Health endpoint', description: 'The API declares GET /health.', intent: 'I-1', modules: '[app]', scope: '["api/openapi.yaml", "tests/openapi*"]' })
    + '\n# Why\nProbes need a path.\n\n# Acceptance criteria\n- AC-1 (unit): api/openapi.yaml declares GET /health with a 200 response; a test reads the file and finds it.\n',
};

// U-1 and U-2 as a builder left them.
const BUILT = {
  'U-1': {
    'src/export.mjs': "import { isAdmin } from '../auth/roles.mjs';\nimport { ROWS } from './rows.mjs';\n\nexport class Forbidden extends Error {}\n\nexport function exportRows(user) {\n  if (!isAdmin(user)) throw new Forbidden('admins only');\n  return ROWS;\n}\n",
    'auth/roles.mjs': "// Who may export: admins only.\nexport function isAdmin(user) {\n  return user?.roles?.includes('admin') === true;\n}\n",
    'db/schema.sql': 'CREATE TABLE users (\n  id INTEGER PRIMARY KEY, -- the user\n  email TEXT NOT NULL -- the login\n);\n\nCREATE TABLE exports (\n  id INTEGER PRIMARY KEY,\n  user_id INTEGER NOT NULL REFERENCES users(id),\n  at TEXT NOT NULL\n);\n',
    'tests/export.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nimport { exportRows, Forbidden } from '../src/export.mjs';\n\ntest('U-1/AC-1 an admin gets the rows', () => assert.equal(exportRows({ roles: ['admin'] }).length, 3));\ntest('U-1/AC-2 anyone else is refused', () => assert.throws(() => exportRows({ roles: ['user'] }), Forbidden));\ntest('U-1/AC-3 the schema has an exports table', () => assert.match(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'), /CREATE TABLE exports \\(\\s+id[^;]+user_id[^;]+at /));\n",
  },
  'U-2': {
    'src/stats.mjs': "import { ROWS } from './rows.mjs';\n\nexport function stats() {\n  return { count: ROWS.length };\n}\n",
    'tests/stats.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { stats } from '../src/stats.mjs';\n\ntest('U-2/AC-1 stats counts the rows', () => assert.deepEqual(stats(), { count: 3 }));\n",
  },
};

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const aidlc = (dir, args, input) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', input });
function must(dir, args, input) {
  const r = aidlc(dir, args, input);
  if (r.status !== 0) throw new Error(`aidlc ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r.stdout;
}
function write(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
}
const commit = (dir, message) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', message); };

export function setup(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'owner@example.com');
  git(dir, 'config', 'user.name', 'Test Owner');
  git(dir, 'config', 'commit.gpgsign', 'false');
  must(dir, ['init', '--name', 'trial']);
  const profile = JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8'));
  write(dir, { ...BASE, '.aidlc/profile.json': JSON.stringify({ ...profile, ...PROFILE }, null, 2) + '\n' });
  must(dir, ['index']);
  commit(dir, 'Trial project');
  const seen = [];
  // U37: the door is refused until the unit links its decision, here from the bundle root (0.46.1).
  if (/PLAN-DECISION U-3/.test(aidlc(dir, ['check']).stdout + aidlc(dir, ['check']).stderr)) seen.push('check reports PLAN-DECISION for U-3');
  if (aidlc(dir, ['approve', 'U-3']).status === 64) seen.push('approve refuses U-3 without its decision');
  write(dir, { 'docs/units/U-3-health.md': BASE['docs/units/U-3-health.md'] + '\n# Logical\n- [A public health endpoint](/decisions/0001-health-endpoint.md)\n' });
  commit(dir, 'U-3 links its decision');
  must(dir, ['approve', 'I-1', 'U-1', 'U-2', 'U-3', 'docs/decisions/0001-health-endpoint.md']);
  commit(dir, 'Approve the plan (test owner)');
  for (const [unit, files] of Object.entries(BUILT)) {
    must(dir, ['card', unit]);
    git(dir, 'switch', '-q', '-c', `unit/${unit}`);
    write(dir, files);
    commit(dir, `${unit} built`);
    git(dir, 'switch', '-q', 'main');
    must(dir, ['report', unit], JSON.stringify({ status: 'done', summary: `${unit} built`, tests: Object.keys(files).filter((f) => f.startsWith('tests/')).map((f) => `${f}: ${unit}/AC-1`) }));
  }
  writeFileSync(join(dir, '.git', 'trial-setup.json'), JSON.stringify({ seen }, null, 2));
  return seen;
}

// What the run shows, per case; the lead's transcript adds what the review record printed.
export function score(dir, transcript = '') {
  const common = resolve(dir, git(dir, 'rev-parse', '--git-common-dir'), 'aidlc');
  const read = (rel) => (existsSync(join(common, rel)) ? JSON.parse(readFileSync(join(common, rel), 'utf8')) : null);
  const setupSeen = JSON.parse(readFileSync(join(dir, '.git', 'trial-setup.json'), 'utf8')).seen;
  const r1 = read('reviews/U-1.json')?.rounds ?? [];
  const sec = r1.filter((r) => r.focus === 'security');
  const fixAfterSec = sec.length && r1.some((r) => r.verdict === 'fix' && r.at > sec[0].at);
  const merged = (u) => git(dir, 'log', '--merges', '--format=%(trailers:key=Unit,valueonly)', 'main').split('\n').map((x) => x.trim()).includes(u);
  return [
    { id: 'U37 PLAN-DECISION before the decision', seen: setupSeen.includes('check reports PLAN-DECISION for U-3') },
    { id: 'U37 approve refused without the decision', seen: setupSeen.includes('approve refuses U-3 without its decision') },
    { id: 'U34 security pass kept after a fix outside its globs', seen: Boolean(fixAfterSec && sec.length === 1 && merged('U-1')) },
    { id: 'U38 a reviewer escalate recorded as a fix round', seen: /a reviewer escalate is a fix round first/.test(transcript) },
    { id: 'U-1 U-2 U-3 merged', seen: ['U-1', 'U-2', 'U-3'].every(merged) },
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir, ...rest] = process.argv.slice(2);
  if (!dir || !['setup', 'approve', 'score'].includes(cmd)) {
    console.error('usage: node tests/evals/trial.mjs setup|approve|score <dir> [doc…|transcript]');
    process.exit(64);
  }
  if (cmd === 'setup') console.log(`ready: ${resolve(dir)}; seen in setup: ${setup(resolve(dir)).join('; ') || 'none'}`);
  else if (cmd === 'approve') { process.stdout.write(must(resolve(dir), ['approve', ...rest])); commit(resolve(dir), `Approve ${rest.join(' ')} (test owner)`); }
  else {
    const results = score(resolve(dir), rest[0] && existsSync(rest[0]) ? readFileSync(rest[0], 'utf8') : '');
    for (const r of results) console.log(`${r.seen ? 'seen    ' : 'NOT SEEN'} ${r.id}`);
  }
}
