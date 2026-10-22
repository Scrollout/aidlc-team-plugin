import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approve, branch, CLI, commit, git, intentDoc, makeRepo, merge, read, unitDoc, write } from './state-repo.mjs';

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
  }, { github });
  approve(dir, 'I-1', 'U-1');
  const bin = mkdtempSync(join(tmpdir(), 'gh-'));
  symlinkSync(STUB, join(bin, 'gh'));
  const state = join(bin, 'state.json');
  writeFileSync(state, JSON.stringify({ repo: REPO, issues, labels: [], calls: [], project: { id: 'PVT_1', fields: FIELDS, items: [] } }));
  return { dir, bin, state };
}

function aidlc({ dir, bin, state }, ...args) {
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...env, PATH: `${bin}:${env.PATH}`, GH_STUB: state } });
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
  assert.deepEqual(item(ctx, u2.number).values, { Status: 'Todo' }, 'fields the doc does not set are left alone');
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

test('U11/AC-2 sync uses no model: it calls only gh, and runs against the recorded stub', () => {
  const src = readFileSync(join(ROOT, 'plugin/cli/lib/board.mjs'), 'utf8');
  assert.equal([...src.matchAll(/execFileSync\(/g)].length, 1);
  assert.match(src, /execFileSync\(B\.gh, \['api'/);
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
  rmSync(join(ctx.bin, 'gh')); // a symlink to the stub: replace the link, never the stub
  writeFileSync(join(ctx.bin, 'gh'), '#!/bin/sh\necho "HTTP 502: Bad gateway (https://api.github.com/graphql)" >&2\nexit 1\n', { mode: 0o755 });
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 70);
  assert.match(r.err, /HTTP 502: Bad gateway/);
});
