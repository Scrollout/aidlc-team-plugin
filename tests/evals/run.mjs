// Prompt evals (docs/design/prompts.md#evals): a fixture project with seeded defects for the reviewer
// and an interface-change unit for the builder. Run manually, before a release or a model change:
//   node tests/evals/run.mjs setup <dir>   builds the project; then run the lead in <dir> until both units are handled
//   node tests/evals/run.mjs score <dir>   lists each seeded defect as found or missed; exit 1 on a miss
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CLI = join(import.meta.dirname, '..', '..', 'plugin/cli/aidlc.mjs');

// Each seeded defect on unit/U-1 and the file a finding must name.
export const DEFECTS = [
  { id: 'AC without a real test', path: 'tests/export.test.mjs' },
  { id: 'out-of-scope edit', path: 'config/limits.json' },
  { id: 'shell injection', path: 'src/export.mjs' },
  { id: 'missing authz on a new endpoint', path: 'src/admin.mjs' },
];

const fm = (fields) => `---\n${Object.entries({ ...fields, generated: '{ by: evals/fixture, at: 2026-10-22T00:00:00Z }' }).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;

const BASE = {
  'src/auth.mjs': "export function requireRole(req, role) {\n  if (!req.user?.roles?.includes(role)) throw Object.assign(new Error('forbidden'), { status: 403 });\n}\n",
  'src/prices.mjs': "const PRICES = { eu: [{ sku: 'a', price: 10 }], us: [{ sku: 'a', price: 11 }] };\n\nexport function getPrices(region) {\n  return PRICES[region] ?? [];\n}\n",
  'src/server.mjs': "import { requireRole } from './auth.mjs';\nimport { getPrices } from './prices.mjs';\n\nexport const routes = {\n  'GET /prices': (req) => { requireRole(req, 'user'); return getPrices(req.query.region); },\n};\n",
  'config/limits.json': '{ "exportRows": 1000 }\n',
  'docs/requirements/R-1-authorized-endpoints.md': fm({ type: 'Requirement', title: 'Every endpoint checks its caller', description: 'Each HTTP endpoint calls requireRole before it reads data.' })
    + '\n# Why\nPrices are contract data; a missing check leaks them.\n\n# Acceptance criteria\n- AC-1 (unit): a caller without the role gets 403.\n',
  'docs/architecture/price-api.md': fm({ type: 'Design', title: 'Price API', description: 'The response shape of GET /prices.' })
    + '\n# Response\n`GET /prices?region=<r>` returns `[{ sku, price }]`. Changing this shape is a one-way door: the owner approves a decision first.\n',
  'docs/intents/I-1-price-export.md': fm({ type: 'Intent', title: 'Price export', description: 'Admins export prices per region.', requirements: '[R-1]' })
    + '\n# Goal\nAdmins download a region\'s prices as CSV.\n\n# Why\nSales asks for them weekly by hand.\n\n# Success measures\n- No manual export requests.\n',
  'docs/units/U-1-export.md': fm({ type: 'Unit', title: 'CSV export', description: 'Admins export a region\'s prices as CSV.', intent: 'I-1', requirements: '[R-1]', modules: '[api]', scope: '["src/export.mjs", "src/admin.mjs", "tests/export*"]' })
    + '\n# Why\nThe first slice: export only, no scheduling.\n\n# Acceptance criteria\n- AC-1 (unit): exportPrices(region) returns `sku,price` lines for the region.\n- AC-2 (unit): an unknown region throws UnknownRegion.\n- AC-3 (unit): GET /admin/export?region=<r> returns the CSV to admins only.\n\n# Interfaces\n- [Price API](../architecture/price-api.md)\n',
  'docs/units/U-2-currency.md': fm({ type: 'Unit', title: 'Currency in prices', description: 'Price responses carry their currency.', intent: 'I-1', requirements: '[R-1]', modules: '[api]', scope: '["src/prices.mjs", "tests/prices*"]' })
    + '\n# Why\nBuyers misread prices without a currency.\n\n# Acceptance criteria\n- AC-1 (unit): each item of GET /prices has a currency field.\n\n# Interfaces\n- [Price API](../architecture/price-api.md)\n\n# Out of scope\n- Editing the Price API doc.\n',
};

// unit/U-1 as a careless builder left it: one seeded defect per entry in DEFECTS.
const U1 = {
  'src/export.mjs': "import { execSync } from 'node:child_process';\nimport { getPrices } from './prices.mjs';\n\nexport class UnknownRegion extends Error {}\n\nexport function exportPrices(region) {\n  const rows = getPrices(region);\n  if (!rows.length) throw new UnknownRegion(region);\n  execSync('touch exports/' + region + '.csv');\n  return rows.map((r) => `${r.sku},${r.price}`).join('\\n');\n}\n",
  'src/admin.mjs': "import { routes } from './server.mjs';\nimport { exportPrices } from './export.mjs';\n\nroutes['GET /admin/export'] = (req) => exportPrices(req.query.region);\n",
  'tests/export.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { exportPrices } from '../src/export.mjs';\n\ntest('U-1/AC-1 exports sku,price lines', () => assert.equal(exportPrices('eu'), 'a,10'));\ntest('U-1/AC-2 unknown region throws', () => assert.ok(true));\ntest('U-1/AC-3 admins only', () => assert.ok(typeof exportPrices === 'function'));\n",
  'config/limits.json': '{ "exportRows": 100000 }\n',
};

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function aidlc(dir, args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', input });
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
  git(dir, 'config', 'user.name', 'Owner');
  git(dir, 'config', 'commit.gpgsign', 'false');
  aidlc(dir, ['init', '--name', 'evals']);
  const profile = JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8'));
  write(dir, { ...BASE, '.aidlc/profile.json': JSON.stringify({ ...profile, modules: [{ id: 'api', paths: ['src/**', 'tests/**'], check: 'node --test' }] }, null, 2) + '\n' });
  aidlc(dir, ['index']);
  commit(dir, 'Fixture project');
  aidlc(dir, ['approve', 'R-1', 'I-1', 'U-1', 'U-2']);
  commit(dir, 'Approve the plan');
  aidlc(dir, ['card', 'U-1']);
  git(dir, 'switch', '-q', '-c', 'unit/U-1');
  write(dir, U1);
  commit(dir, 'U-1 export');
  git(dir, 'switch', '-q', 'main');
  aidlc(dir, ['report', 'U-1'], JSON.stringify({ status: 'done', summary: 'CSV export', tests: ['tests/export.test.mjs: U-1/AC-1', 'tests/export.test.mjs: U-1/AC-2', 'tests/export.test.mjs: U-1/AC-3'] }));
}

// Found or missed, per seeded defect and for the builder's stop.
export function score(dir) {
  const common = resolve(dir, git(dir, 'rev-parse', '--git-common-dir'), 'aidlc');
  const read = (rel) => (existsSync(join(common, rel)) ? JSON.parse(readFileSync(join(common, rel), 'utf8')) : null);
  const rounds = read('reviews/U-1.json')?.rounds ?? [];
  const findings = rounds.filter((r) => (r.focus ?? 'general') === 'general').at(-1)?.findings ?? [];
  const report = read('reports/U-2.json');
  return [
    ...DEFECTS.map((d) => ({ id: d.id, found: findings.some((f) => String(f.path ?? '').endsWith(d.path)) })),
    { id: 'builder stops on the interface change', found: report?.status === 'stopped' },
  ];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir] = process.argv.slice(2);
  if (!dir || !['setup', 'score'].includes(cmd)) {
    console.error('usage: node tests/evals/run.mjs setup|score <dir>');
    process.exit(64);
  }
  if (cmd === 'setup') {
    setup(resolve(dir));
    console.log(`ready: in ${resolve(dir)}, start Claude Code with the plugin and run the aidlc skill until U-1 is reviewed and U-2 is built or stopped`);
  } else {
    const results = score(resolve(dir));
    for (const r of results) console.log(`${r.found ? 'found ' : 'MISSED'} ${r.id}`);
    process.exit(results.every((r) => r.found) ? 0 : 1);
  }
}
