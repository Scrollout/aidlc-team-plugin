import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, branch, CLI, commit, git, intentDoc, makeRepo, merge, read, tempDir, unitDoc, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const STUB = join(import.meta.dirname, 'fixtures/board/gh.mjs');
const REPO = 'acme/shop';

const FIELDS = [
  { id: 'F_status', name: 'Status', dataType: 'SINGLE_SELECT', options: ['Todo', 'In Progress', 'In review', 'On hold', 'Done'].map((name, k) => ({ id: `S${k}`, name })) },
  { id: 'F_priority', name: 'Priority', dataType: 'SINGLE_SELECT', options: ['P0', 'P1', 'P2'].map((name, k) => ({ id: `P${k}`, name })) },
  { id: 'F_effort', name: 'Effort', dataType: 'SINGLE_SELECT', options: ['S', 'M', 'L'].map((name, k) => ({ id: `E${k}`, name })) },
  { id: 'F_wave', name: 'Wave', dataType: 'NUMBER' },
  { id: 'F_start', name: 'Start date', dataType: 'DATE' },
  { id: 'F_title', name: 'Title', dataType: 'TITLE' },
];
const GITHUB = {
  repo: REPO,
  project: 'orgs/acme/projects/3',
  fields: { Priority: { from: 'priority', map: { 2: 'P0', 1: 'P1' } }, Effort: 'board.effort', Wave: 'board.wave', 'Start date': 'board.start' },
};

const U = (n) => `docs/units/U-${n}-${n === 1 ? 'export' : 'currency'}.md`;
const withFm = (doc, lines) => doc.replace('---\n\n', `${lines}\n---\n\n`);

// A project with an approved intent, an approved unit with board fields and a draft unit, plus an empty stub.
function setup({ github = GITHUB, issues = [], u2 = '' } = {}) {
  const dir = makeRepo({
    'docs/intents/I-1-shop.md': intentDoc('I-1', 'Shop'),
    [U(1)]: withFm(unitDoc({ title: 'Export', scope: ['src/a/**'], modules: ['api'], acs: ['- AC-1 (unit): exports `sku,price`.', '- AC-2 (unit): rejects an unknown region.'] }),
      'priority: 2\nboard: { effort: M, wave: 1, start: 2026-11-02 }'),
    [U(2)]: withFm(unitDoc({ title: 'Currency', scope: ['src/b/**'] }), u2),
  }, { github: github && { gh: [process.execPath, STUB], ...github } }); // the stub, through github.gh on every platform
  approve(dir, 'I-1', 'U-1');
  const bin = tempDir('gh-');
  const state = join(bin, 'state.json');
  writeFileSync(state, JSON.stringify({ repo: REPO, issues, labels: [], calls: [], project: { id: 'PVT_1', fields: FIELDS, items: [] } }));
  return { dir, bin, state };
}

function aidlc({ dir, bin, state }, ...args) {
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...env, GH_STUB: state } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const stub = ({ state }) => JSON.parse(readFileSync(state, 'utf8'));
const writes = (ctx) => stub(ctx).calls.filter((c) => c.write);
const byTitle = (ctx, prefix) => stub(ctx).issues.find((i) => i.title.startsWith(prefix));
const item = (ctx, number) => stub(ctx).project.items.find((i) => i.number === number);

test('U11/AC-1 sync creates one issue per intent and unit, units as sub-issues, with status and fields from the profile maps', () => {
  const ctx = setup();
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 0, r.err + r.out);
  const [i1, u1, u2] = ['I-1 Shop', 'U-1 Export', 'U-2 Currency'].map((t) => byTitle(ctx, t));
  assert.ok(i1 && u1 && u2, r.out);
  assert.equal(u1.parent, i1.number);
  assert.equal(u2.parent, i1.number);
  assert.deepEqual(u1.labels.sort(), ['api', 'standard']);
  assert.match(u1.body, /<!-- unit: U-1 -->/);
  assert.match(u1.body, /^- \[ \] AC-1 \(unit\): exports `sku,price`\.$/m);
  assert.match(u1.body, new RegExp(`https://github.com/${REPO}/blob/main/docs/units/U-1-export.md`));
  assert.deepEqual(item(ctx, u1.number).values, { Status: 'Todo', Priority: 'P0', Effort: 'M', Wave: 1, 'Start date': '2026-11-02' });
  assert.deepEqual(item(ctx, u2.number).values, { Status: 'Todo', Wave: 1 }, 'the wave is derived; other fields the doc does not set are left alone');
  assert.deepEqual(stub(ctx).labels.sort(), ['api', 'standard']);
});

test('U11/AC-1 a second sync changes nothing; a state change writes only its difference', () => {
  const ctx = setup();
  aidlc(ctx, 'sync');
  const before = writes(ctx).length;
  const again = aidlc(ctx, 'sync');
  assert.equal(again.out, 'the board is in sync\n');
  assert.equal(writes(ctx).length, before, 'no write on the second run');

  branch(ctx.dir, 'U-1', 'src/a/x.txt');
  spawnSync(process.execPath, [CLI, 'report', 'U-1'], { cwd: ctx.dir, input: '{"status": "done"}' });
  const moved = aidlc(ctx, 'sync');
  assert.equal(moved.out, `set Status of #${byTitle(ctx, 'U-1').number} to In review\n`);

  merge(ctx.dir, 'U-1');
  aidlc(ctx, 'sync');
  const u1 = byTitle(ctx, 'U-1');
  assert.equal(u1.state, 'closed', 'sync closes a merged unit');
  assert.equal(item(ctx, u1.number).values.Status, 'Done');
  assert.match(u1.body, /^- \[x\] AC-1/m, 'ACs are ticked once merged');
});

test('U11/AC-1 board.issue links an existing issue; a held unit is On hold; board fields never stale an approval', () => {
  const old = { number: 7, id: 1007, node_id: 'I_7', title: 'K2: currency', body: 'from another tool', state: 'open', labels: ['task'], parent: null };
  const ctx = setup({ issues: [old], u2: 'board: { issue: 7 }\nhold: true' });
  approve(ctx.dir, 'U-2');
  write(ctx.dir, { [U(2)]: read(ctx.dir, U(2)).replace('board: { issue: 7 }', 'board: { issue: 7, effort: L }') });
  commit(ctx.dir, 'plan the effort');
  assert.match(aidlc(ctx, 'status').out, /U-2 approved/, 'board fields are outside the approval hash');
  aidlc(ctx, 'sync');
  const seven = stub(ctx).issues.find((i) => i.number === 7);
  assert.equal(seven.title, 'U-2 Currency');
  assert.match(seven.body, /<!-- unit: U-2 -->/);
  assert.deepEqual(seven.labels.sort(), ['standard', 'task'], 'labels people added stay');
  assert.equal(stub(ctx).issues.length, 3, 'no duplicate for U-2');
  assert.equal(item(ctx, 7).values.Status, 'On hold');
  assert.equal(item(ctx, 7).values.Effort, 'L');
});

test('U11/AC-1 a lagging issue list never duplicates the board; with duplicates, the oldest issue wins', () => {
  const ctx = setup();
  aidlc(ctx, 'sync');
  const count = stub(ctx).issues.length;
  writeFileSync(ctx.state, JSON.stringify({ ...stub(ctx), lag: 1 }));
  assert.equal(aidlc(ctx, 'sync').out, 'the board is in sync\n');
  assert.equal(stub(ctx).issues.length, count, 'the list is read again before creating');

  const s = stub(ctx);
  const u1 = s.issues.find((i) => i.title.startsWith('U-1'));
  s.issues.unshift({ ...u1, number: 99, id: 1099, node_id: 'I_99', title: 'a newer copy' });
  writeFileSync(ctx.state, JSON.stringify(s));
  aidlc(ctx, 'sync');
  assert.equal(stub(ctx).issues.find((i) => i.number === 99).title, 'a newer copy', 'the newer copy, listed first as GitHub does, is left alone');
  assert.equal(stub(ctx).issues.find((i) => i.number === u1.number).title, 'U-1 Export');
});

test('U11/AC-1 sync sets assignees, a milestone per intent and the issue type; the wave follows the dependencies', () => {
  const ctx = setup({ github: { ...GITHUB, types: { unit: 'Story' } }, u2: 'depends: [U-1]' });
  write(ctx.dir, { 'docs/intents/I-1-shop.md': withFm(intentDoc('I-1', 'Shop'), 'board: { target: 2026-12-01 }') });
  commit(ctx.dir, 'intent target');
  approve(ctx.dir, 'I-1');
  writeFileSync(ctx.state, JSON.stringify({ ...stub(ctx), ownerType: 'Organization', login: 'marius' }));
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 0, r.err + r.out);
  assert.deepEqual(stub(ctx).milestones.map((m) => [m.title, m.due_on]), [['I-1 Shop', '2026-12-01T00:00:00Z']]);
  const [i1, u1, u2] = ['I-1', 'U-1', 'U-2'].map((t) => byTitle(ctx, t));
  for (const i of [i1, u1, u2]) {
    assert.deepEqual(i.assignees, ['marius'], 'the gh user, by default');
    assert.equal(i.milestone, 1, 'the intent and its units share its milestone');
  }
  assert.deepEqual([i1.type, u1.type], ['Feature', 'Story'], 'cli.json defaults, overridden by github.types');
  assert.equal(item(ctx, u2.number).values.Wave, 2, 'U-2 depends on U-1');

  const user = setup();
  assert.equal(aidlc(user, 'sync').code, 0, 'an intent without a target gets a milestone with no due date');
  assert.ok(stub(user).issues.every((i) => !i.type), 'no issue types on a personal repository');
  assert.equal(aidlc(user, 'sync').out, 'the board is in sync\n');
});

test('U11/AC-1 with a board, plan lint requires the values the board maps, except the derived wave', () => {
  const ctx = setup();
  const r = aidlc(ctx, 'check');
  assert.match(r.out, /U-2 has no priority, which the board shows/);
  assert.match(r.out, /U-2 has no board\.effort/);
  assert.doesNotMatch(r.out, /board\.wave/);
  assert.doesNotMatch(r.out, /U-1 has no/, 'U-1 carries them all');
});

test('U11/AC-2 sync uses no model: it calls only gh, and runs against the recorded stub', () => {
  const src = readFileSync(join(ROOT, 'plugin/cli/lib/board.mjs'), 'utf8');
  assert.equal([...src.matchAll(/execFileSync\(/g)].length, 1);
  assert.match(src, /execFileSync\(ghCommand\[0\], \[\.\.\.ghCommand\.slice\(1\), 'api'/);
  assert.doesNotMatch(src, /fetch\(|node:https?|claude|anthropic/i);
  const ctx = setup();
  aidlc(ctx, 'sync');
  assert.ok(stub(ctx).calls.length > 0);
  const off = setup({ github: null });
  const r = aidlc(off, 'sync');
  assert.equal(r.code, 64);
  assert.match(r.err, /no github section in the profile/);
});

test('U11/AC-3 issue bodies come from the template, a project template wins, and bodies stay under 1,500 chars', () => {
  const ctx = setup();
  const acs = Array.from({ length: 40 }, (_, k) => `- AC-${k + 1} (unit): ${'a long criterion '.repeat(4)}${k}.`);
  write(ctx.dir, { [U(2)]: unitDoc({ title: 'Currency', scope: ['src/b/**'], acs }) });
  commit(ctx.dir, 'long unit');
  aidlc(ctx, 'sync');
  const u2 = byTitle(ctx, 'U-2');
  assert.ok(u2.body.length <= 1500, `${u2.body.length}`);
  assert.match(u2.body, /- \[ \] AC-1 /);
  assert.doesNotMatch(u2.body, /AC-40 /);
  assert.match(u2.body, /<!-- unit: U-2 -->$/m);

  write(ctx.dir, { '.aidlc/templates/issue.md': 'Goal: {{description}}\n{{marker}}\n' });
  aidlc(ctx, 'sync');
  assert.equal(byTitle(ctx, 'U-2').body, 'Goal: Currency goal.\n<!-- unit: U-2 -->\n');
});

test('U11/AC-4 fix --from-issue creates a fix unit linked to the issue; board edits never change docs', () => {
  const report = { number: 12, id: 1012, node_id: 'I_12', title: 'Export drops the last row', body: 'seen in prod', state: 'open', labels: [], parent: null };
  const ctx = setup({ issues: [report] });
  const r = aidlc(ctx, 'fix', '--from-issue', '12', '--scope', 'src/a/**');
  assert.equal(r.code, 0, r.err + r.out);
  const file = git(ctx.dir, 'ls-files', '--others', 'docs/units').split('\n')[0];
  const doc = read(ctx.dir, file);
  assert.match(doc, /^title: "Export drops the last row"$/m);
  assert.match(doc, /^board: \{ issue: 12 \}$/m);
  commit(ctx.dir, 'fix unit');

  aidlc(ctx, 'sync');
  assert.equal(stub(ctx).issues.filter((i) => i.title.endsWith('Export drops the last row')).length, 1);
  const s = stub(ctx);
  s.issues.find((i) => i.number === 12).title = 'Renamed on the board';
  writeFileSync(ctx.state, JSON.stringify(s));
  aidlc(ctx, 'sync');
  assert.equal(git(ctx.dir, 'status', '--porcelain'), '', 'sync writes no file');
  assert.match(stub(ctx).issues.find((i) => i.number === 12).title, /^U-\d+ Export drops the last row$/, 'the doc wins over the board');
});

test('U11/AC-2 a failing gh call reports gh\'s own error', () => {
  const ctx = setup();
  const failing = join(ctx.bin, 'gh-fails.mjs');
  writeFileSync(failing, 'process.stderr.write("HTTP 502: Bad gateway (https://api.github.com/graphql)\\n"); process.exit(1);\n');
  const profile = JSON.parse(read(ctx.dir, '.aidlc/profile.json'));
  commit(ctx.dir, 'a failing gh', { '.aidlc/profile.json': { ...profile, github: { ...profile.github, gh: [process.execPath, failing] } } });
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 70);
  assert.match(r.err, /HTTP 502: Bad gateway/);
});

test('U14/AC-1 an issue list shorter than the repository count is retried with backoff; while it stays short, sync creates nothing', () => {
  const ctx = setup();
  aidlc(ctx, 'sync');
  const before = stub(ctx);
  writeFileSync(ctx.state, JSON.stringify({ ...before, calls: [], lag: 1 })); // one empty page
  assert.equal(aidlc(ctx, 'sync').out, 'the board is in sync\n');
  assert.deepEqual(writes(ctx), [], 'one empty page creates nothing');
  assert.equal(stub(ctx).calls.filter((c) => c.op === 'count').length, 2, 'counted, waited, listed again');

  writeFileSync(ctx.state, JSON.stringify({ ...stub(ctx), calls: [], lag: 99, labels: [], milestones: [] }));
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 70);
  assert.match(r.err, /GitHub listed 0 of the repository's 3 issues, also after waiting → sync created nothing/);
  assert.deepEqual(writes(ctx), [], 'no issue, label or milestone is created from a short list');
});

test('U14/AC-2 PLAN-BOARD names the board field and gives an example from the profile map', () => {
  const ctx = setup();
  const lines = aidlc(ctx, 'check').out.split('\n').filter((l) => l.includes('PLAN-BOARD'));
  assert.ok(lines.some((l) => l.includes('U-2 has no priority, which the board shows as Priority: add priority: 1 (1 means P1, 2 means P0)')), lines.join('\n'));
  assert.ok(lines.some((l) => l.includes('U-2 has no board.effort, which the board shows as Effort: add board: { effort: <value> }')), lines.join('\n'));
  assert.ok(!lines.some((l) => l.includes('board.wave')), 'the wave is derived');
});
