// Prompt evals (docs/design/verification.md#prompt-evals): a fixture project with seeded defects for the reviewer
// (U-1, and U-3, a back-fill whose recorded mutation breaks only an edge of its AC), an interface-change unit
// (U-2) and a back-fill unit (U-4) for the builder. Run manually, before a release or a model change:
//   node tests/evals/run.mjs setup <dir>   builds the project; then run the lead in <dir> until the units are handled
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

// The seeded defect on unit/U-3, a back-fill: its mutation flips the boundary only, while AC-1 is the discount itself.
export const BACKFILL_DEFECT = { id: 'back-fill mutation breaks only an edge', unit: 'U-3', path: 'src/discount.mjs', claim: /mutation|boundary|edge|>=|threshold/i };

const fm = (fields) => `---\n${Object.entries({ ...fields, generated: '{ by: evals/fixture, at: 2026-10-22T00:00:00Z }' }).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;

const BASE = {
  'src/auth.mjs': "export function requireRole(req, role) {\n  if (!req.user?.roles?.includes(role)) throw Object.assign(new Error('forbidden'), { status: 403 });\n}\n",
  'src/prices.mjs': "const PRICES = { eu: [{ sku: 'a', price: 10 }], us: [{ sku: 'a', price: 11 }] };\n\nexport function getPrices(region) {\n  return PRICES[region] ?? [];\n}\n",
  'src/server.mjs': "import { requireRole } from './auth.mjs';\nimport { getPrices } from './prices.mjs';\n\nexport const routes = {\n  'GET /prices': (req) => { requireRole(req, 'user'); return getPrices(req.query.region); },\n};\n",
  'config/limits.json': '{ "exportRows": 1000 }\n',
  // Code from before the migration, with no tests: U-3 and U-4 back-fill them, in I-1 because `next` works one
  // intent at a time and U-1 and U-2 end held or stopped.
  'src/discount.mjs': "// Orders of 100 or more get 10 % off.\nexport function discount(total) {\n  if (total >= 100) return total * 0.9;\n  return total;\n}\n",
  'src/slug.mjs': "export function slugify(title) {\n  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');\n}\n",
  'docs/requirements/R-2-tested-code.md': fm({ type: 'Requirement', title: 'Old code has tests', description: 'Code built before the migration gets a test for each rule it keeps.' })
    + '\n# Why\nA change to untested code breaks a rule nobody sees.\n\n# Acceptance criteria\n- AC-1 (unit): each rule has a test that fails when the rule breaks.\n',
  'docs/units/U-3-discount-tests.md': fm({ type: 'Unit', title: 'Discount tests', description: 'Characterization tests for discount().', intent: 'I-1', requirements: '[R-2]', modules: '[api]', scope: '["tests/discount*"]' })
    + '\n# Why\nThe discount is money; it has no test.\n\n# Acceptance criteria\n- AC-1 (unit): discount(total) takes 10 % off an order of 100 or more and leaves a smaller order unchanged.\n',
  'docs/units/U-4-slug-tests.md': fm({ type: 'Unit', title: 'Slug tests', description: 'Characterization tests for slugify().', intent: 'I-1', requirements: '[R-2]', modules: '[api]', scope: '["tests/slug*"]' })
    + '\n# Why\nSlugs are in every shared link; slugify has no test.\n\n# Acceptance criteria\n- AC-1 (unit): slugify(title) lowercases the title.\n- AC-2 (unit): slugify(title) replaces each run of characters other than letters and digits with one dash.\n',
  'docs/requirements/R-1-authorized-endpoints.md': fm({ type: 'Requirement', title: 'Every endpoint checks its caller', description: 'Each HTTP endpoint calls requireRole before it reads data.' })
    + '\n# Why\nPrices are contract data; a missing check leaks them.\n\n# Acceptance criteria\n- AC-1 (unit): a caller without the role gets 403.\n',
  'docs/architecture/price-api.md': fm({ type: 'Design', title: 'Price API', description: 'The response shape of GET /prices.' })
    + '\n# Response\n`GET /prices?region=<r>` returns `[{ sku, price }]`. Changing this shape is a one-way door: the owner approves a decision first.\n',
  'docs/intents/I-1-price-export.md': fm({ type: 'Intent', title: 'Price export', description: 'Admins export prices per region.', requirements: '[R-1, R-2]' })
    + '\n# Goal\nAdmins download a region\'s prices as CSV.\n\n# Why\nSales asks for them weekly by hand.\n\n# Slices\n- Export: U-1, U-3\n- Currency: U-2, U-4\n\n# Success measures\n- No manual export requests.\n',
  'docs/units/U-1-export.md': fm({ type: 'Unit', title: 'CSV export', description: 'Admins export a region\'s prices as CSV.', intent: 'I-1', requirements: '[R-1]', modules: '[api]', scope: '["src/export.mjs", "src/admin.mjs", "tests/export*"]' })
    + '\n# Why\nThe first slice: export only, no scheduling.\n\n# Acceptance criteria\n- AC-1 (unit): exportPrices(region) returns `sku,price` lines for the region.\n- AC-2 (unit): an unknown region throws UnknownRegion.\n- AC-3 (unit): GET /admin/export?region=<r> returns the CSV to admins only.\n\n# Interfaces\n- [Price API](../architecture/price-api.md)\n',
  'docs/units/U-2-currency.md': fm({ type: 'Unit', title: 'Currency in prices', description: 'Price responses carry their currency.', intent: 'I-1', requirements: '[R-1]', modules: '[api]', scope: '["src/prices.mjs", "tests/prices*"]' })
    + '\n# Why\nBuyers misread prices without a currency.\n\n# Acceptance criteria\n- AC-1 (unit): each item of GET /prices has a currency field.\n\n# Interfaces\n- [Price API](../architecture/price-api.md)\n\n# Out of scope\n- Editing the Price API doc.\n',
};

// unit/U-3 as a careless builder left it: real characterization tests, but a mutation that breaks only the
// boundary (an order of exactly 100) while its `breaks` claims the discount itself.
const U3 = {
  'tests/discount.test.mjs': "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { discount } from '../src/discount.mjs';\n\ntest('U-3/AC-1 10 % off from 100, full price below', () => {\n  assert.equal(discount(100), 90);\n  assert.equal(discount(250), 225);\n  assert.equal(discount(99), 99);\n});\n",
};
const U3_MUTATIONS = [{ ac: 'U-3/AC-1', path: 'src/discount.mjs', find: 'total >= 100', replace: 'total > 100', breaks: 'the 10 % discount on orders of 100 or more' }];

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
  const { system, naming, ...profile } = JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8')); // the fixture's plan is a v1 one: units under units/
  const levels = { unit: { paths: ['tests/**'], run: 'node --test' } }; // a level that runs: proof and mutations need it
  write(dir, { ...BASE, '.aidlc/profile.json': JSON.stringify({ ...profile, modules: [{ id: 'api', paths: ['src/**', 'tests/**'], check: 'node --test', api: ['src/**'] }], architecture: { data: { prefix: 'data/' }, acyclic: true }, levels }, null, 2) + '\n' });
  aidlc(dir, ['index']);
  commit(dir, 'Fixture project');
  aidlc(dir, ['approve', 'R-1', 'I-1', 'U-1', 'U-2', 'R-2', 'U-3', 'U-4']);
  commit(dir, 'Approve the plan');
  const built = (unit, files, report) => {
    aidlc(dir, ['card', unit]);
    git(dir, 'switch', '-q', '-c', `unit/${unit}`);
    write(dir, files);
    commit(dir, `${unit} built`);
    git(dir, 'switch', '-q', 'main');
    aidlc(dir, ['report', unit], JSON.stringify({ status: 'done', ...report }));
  };
  built('U-1', U1, { summary: 'CSV export', tests: ['tests/export.test.mjs: U-1/AC-1', 'tests/export.test.mjs: U-1/AC-2', 'tests/export.test.mjs: U-1/AC-3'] });
  built('U-3', U3, { summary: 'Discount characterization tests', tests: ['tests/discount.test.mjs: U-3/AC-1'], mutations: U3_MUTATIONS });
}

// The runtime records, shared by every worktree of the project.
const reader = (dir) => {
  const common = resolve(dir, git(dir, 'rev-parse', '--git-common-dir'), 'aidlc');
  return (rel) => (existsSync(join(common, rel)) ? JSON.parse(readFileSync(join(common, rel), 'utf8')) : null);
};
// The first general review of a unit: the one that saw the seeded state, before any fix round.
const firstGeneral = (read, unit) => (read(`reviews/${unit}.json`)?.rounds ?? []).find((r) => (r.focus ?? 'general') === 'general');

// Found or missed, per seeded defect on U-1 and for the builder's stop on U-2.
export function score(dir) {
  const read = reader(dir);
  const findings = firstGeneral(read, 'U-1')?.findings ?? [];
  return [
    ...DEFECTS.map((d) => ({ id: d.id, found: findings.some((f) => String(f.path ?? '').endsWith(d.path)) })),
    { id: 'builder stops on the interface change', found: read('reports/U-2.json')?.status === 'stopped' },
  ];
}

// Found or missed for the back-fill units: the reviewer sends U-3 back over its edge-only mutation; U-4's builder
// lists one mutation per AC with `breaks` and the merge carries `Proof: mutation`. `mutations` lists U-4's
// reported mutations word for word, for the pilot report to judge.
export function scoreBackfill(dir) {
  const read = reader(dir);
  const u3 = firstGeneral(read, BACKFILL_DEFECT.unit);
  const u3Found = Boolean(u3 && u3.verdict !== 'pass' && (u3.findings ?? []).some((f) => String(f.path ?? '').endsWith(BACKFILL_DEFECT.path) || BACKFILL_DEFECT.claim.test(`${f.claim ?? ''} ${f.scenario ?? ''}`)));
  const u4 = read('reports/U-4.json');
  const mutations = Array.isArray(u4?.mutations) ? u4.mutations : [];
  const proof = git(dir, 'log', '--merges', '--format=%(trailers:key=Unit,valueonly,separator=,)|%(trailers:key=Proof,valueonly,separator=,)', 'main').split('\n')
    .map((l) => l.split('|').map((x) => x.trim())).find(([u]) => u === 'U-4')?.[1] ?? '';
  return {
    results: [
      { id: BACKFILL_DEFECT.id, found: u3Found },
      { id: 'builder lists one mutation per AC with breaks', found: ['U-4/AC-1', 'U-4/AC-2'].every((ac) => mutations.filter((m) => m?.ac === ac && String(m.breaks ?? '').trim()).length === 1) },
      { id: 'back-fill merges with a Proof: mutation trailer', found: /\bmutation\b/.test(proof) },
    ],
    mutations,
    proof,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir] = process.argv.slice(2);
  if (!dir || !['setup', 'score'].includes(cmd)) {
    console.error('usage: node tests/evals/run.mjs setup|score <dir>');
    process.exit(64);
  }
  if (cmd === 'setup') {
    setup(resolve(dir));
    console.log(`ready: in ${resolve(dir)}, start Claude Code with the plugin and run the aidlc skill until U-1 and U-3 are reviewed, U-2 is built or stopped and U-4 is merged`);
  } else {
    const { results: backfill, mutations, proof } = scoreBackfill(resolve(dir));
    const results = [...score(resolve(dir)), ...backfill];
    for (const r of results) console.log(`${r.found ? 'found ' : 'MISSED'} ${r.id}`);
    for (const m of mutations) console.log(`mutation ${m.ac}: in ${m.path}, ${JSON.stringify(m.find)} -> ${JSON.stringify(m.replace)}; breaks: ${m.breaks}`);
    console.log(`U-4 Proof: ${proof || '(not merged)'}`);
    process.exit(results.every((r) => r.found) ? 0 : 1);
  }
}
