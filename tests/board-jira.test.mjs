import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { approve, branch, CLI, commit, intentDoc, makeRepo, merge, read, tempDir, unitDoc, write } from './state-repo.mjs';

const ACLI = join(import.meta.dirname, 'fixtures/board/acli.mjs');
const GH = join(import.meta.dirname, 'fixtures/board/gh.mjs');
const JIRA = { site: 'example.atlassian.net', project: 'KAN' };

const U = (n) => `docs/units/U-${n}-${n === 1 ? 'export' : 'currency'}.md`;
const withFm = (doc, lines) => doc.replace('---\n\n', `${lines}\n---\n\n`);

// An approved intent with two approved bolts, a Jira section that runs the stub, and an empty Jira project.
function setup({ jira = JIRA, github = null, items = [], u2 = '' } = {}) {
  const dir = makeRepo({
    'docs/intents/I-1-shop.md': intentDoc('I-1', 'Shop'),
    [U(1)]: unitDoc({ title: 'Export', scope: ['src/a/**'], modules: ['api'], acs: ['- AC-1 (unit): exports `sku,price`.', '- AC-2 (unit): rejects an unknown region.'] }),
    [U(2)]: withFm(unitDoc({ title: 'Currency', scope: ['src/b/**'] }), u2),
  }, { ...(jira && { jira: { acli: [process.execPath, ACLI], ...jira } }), ...(github && { github: { gh: [process.execPath, GH], ...github } }), board: { backoff: [0, 0, 0, 0] } });
  approve(dir, 'I-1', 'U-1', 'U-2');
  const bin = tempDir('acli-');
  const state = join(bin, 'jira.json'), gh = join(bin, 'gh.json');
  writeFileSync(state, JSON.stringify({ items, calls: [], statuses: ['To Do', 'In Progress', 'Done'] }));
  writeFileSync(gh, JSON.stringify({ repo: github?.repo, issues: [], labels: [], calls: [] }));
  return { dir, state, gh };
}

function aidlc({ dir, state, gh }, ...args) {
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: { ...env, ACLI_STUB: state, GH_STUB: gh } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const stub = ({ state }) => JSON.parse(readFileSync(state, 'utf8'));
const writes = (ctx) => stub(ctx).calls.filter((c) => c.write);
const bySummary = (ctx, prefix) => stub(ctx).items.find((i) => i.fields.summary.startsWith(prefix));
const tasks = (i) => i.fields.description.content.filter((n) => n.type === 'taskList').flatMap((n) => n.content).map((t) => [t.attrs.state, t.content[0].text]);

test('B268/AC-1 an intent and its two bolts become an Epic and two Stories under it, with labels, markers and the AC checklist', () => {
  const ctx = setup();
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 0, r.err + r.out);
  const [i1, u1, u2] = ['I-1 Shop', 'U-1 Export', 'U-2 Currency'].map((t) => bySummary(ctx, t));
  assert.ok(i1 && u1 && u2, r.out);
  assert.deepEqual([i1, u1, u2].map((i) => i.fields.issuetype.name), ['Epic', 'Story', 'Story']);
  assert.equal(i1.fields.parent, null);
  assert.deepEqual([u1.fields.parent.key, u2.fields.parent.key], [i1.key, i1.key], 'each Story sits under its intent\'s Epic');
  assert.deepEqual(i1.fields.labels, ['aidlc-I-1']);
  assert.deepEqual(u1.fields.labels.sort(), ['aidlc-U-1', 'api', 'standard']);
  assert.deepEqual(tasks(u1), [['TODO', 'AC-1 (unit): exports `sku,price`.'], ['TODO', 'AC-2 (unit): rejects an unknown region.']], 'the ACs are a checklist');
  const text = JSON.stringify(u1.fields.description);
  assert.match(text, /Doc: docs\/units\/U-1-export\.md/, 'with no repository, the link is the doc\'s path');
  assert.doesNotMatch(text, /<!--/, 'no HTML marker in a Jira description');
  assert.match(r.out, new RegExp(`^created ${i1.key} I-1 Shop$`, 'm'));
  const created = writes(ctx).filter((c) => c.args[0] === 'create');
  assert.deepEqual(created.map((c) => c.args.slice(0, 5)), ['I-1', 'U-1', 'U-2'].map((_, k) => ['create', '--project', 'KAN', '--type', k ? 'Story' : 'Epic']));
});

test('B268/AC-1 depends is a Blocks link from the dependency to the bolt; a second sync makes no write', () => {
  const ctx = setup({ u2: 'depends: [U-1]' });
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 0, r.err + r.out);
  const [u1, u2] = ['U-1', 'U-2'].map((t) => bySummary(ctx, t));
  assert.deepEqual(u2.fields.issuelinks, [{ type: { name: 'Blocks' }, inwardIssue: { key: u1.key } }]);
  assert.match(r.out, new RegExp(`^${u2.key} is blocked by ${u1.key}$`, 'm'));
  assert.deepEqual(writes(ctx).find((c) => c.args[0] === 'link').args, ['link', 'create', '--in', u1.key, '--out', u2.key, '--type', 'Blocks', '--yes']);
  const before = writes(ctx).length;
  const again = aidlc(ctx, 'sync');
  assert.equal(again.out, 'the board on KAN is in sync\n', again.err);
  assert.equal(writes(ctx).length, before, 'no write on the second run');
});

test('B268/AC-1 a bolt under way moves to In Progress, and a merged one to Done with its ACs ticked', () => {
  const ctx = setup();
  aidlc(ctx, 'sync');
  branch(ctx.dir, 'U-1', 'src/a/x.txt');
  spawnSync(process.execPath, [CLI, 'report', 'U-1'], { cwd: ctx.dir, input: '{"status": "done"}' });
  const moved = aidlc(ctx, 'sync');
  const [i1, u1] = ['I-1', 'U-1'].map((t) => bySummary(ctx, t));
  assert.equal(moved.out, `moved ${i1.key} to In Progress\nmoved ${u1.key} to In Progress\n`, 'the intent is under way once a bolt is past approval');

  merge(ctx.dir, 'U-1');
  const done = aidlc(ctx, 'sync');
  assert.match(done.out, new RegExp(`^updated ${u1.key}: description\nmoved ${u1.key} to Done$`, 'm'));
  const merged = bySummary(ctx, 'U-1');
  assert.equal(merged.fields.status.name, 'Done');
  assert.deepEqual(tasks(merged).map(([state]) => state), ['DONE', 'DONE'], 'ACs are ticked once merged');
  assert.equal(aidlc(ctx, 'sync').out, 'the board on KAN is in sync\n');
});

test('B268/AC-2 board.issue names a Jira item: sync edits it and adds the marker; labels people added stay', () => {
  const old = { key: 'KAN-7', fields: { summary: 'K2: currency', status: { name: 'To Do' }, labels: ['customer'], issuetype: { name: 'Story' }, description: 'written by hand', parent: null, issuelinks: [] } };
  const ctx = setup({ items: [old], u2: 'board: { issue: KAN-7 }' });
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 0, r.err + r.out);
  const seven = stub(ctx).items.find((i) => i.key === 'KAN-7');
  assert.equal(seven.fields.summary, 'U-2 Currency');
  assert.deepEqual(seven.fields.labels.sort(), ['aidlc-U-2', 'customer', 'standard']);
  assert.match(r.out, /^updated KAN-7: summary, description, labels$/m);
  assert.equal(stub(ctx).items.length, 3, 'no duplicate for U-2');
  assert.equal(aidlc(ctx, 'sync').out, 'the board on KAN is in sync\n', 'found by its marker from then on');
});

test('B268/AC-2 a label the plugin set and the plan dropped goes; a space becomes a dash; a lagging search never duplicates', () => {
  const ctx = setup();
  // A project template that labels a bolt from its own board values, which stay outside the approval hash.
  const labels = ['requirements', 'decisions', 'slices', 'layer', 'lane', 'modules', 'board.tags'];
  write(ctx.dir, { '.aidlc/templates/board.json': JSON.stringify({ kinds: { unit: { labels } } }), [U(1)]: withFm(read(ctx.dir, U(1)), 'board: { tags: ["price list"] }') });
  commit(ctx.dir, 'a tag with a space');
  aidlc(ctx, 'sync');
  assert.ok(bySummary(ctx, 'U-1').fields.labels.includes('price-list'), 'Jira labels hold no space');
  writeFileSync(ctx.state, JSON.stringify({ ...stub(ctx), lag: 1 }));
  assert.equal(aidlc(ctx, 'sync').out, 'the board on KAN is in sync\n', 'the search is read again before creating');
  assert.equal(stub(ctx).items.length, 3);
  write(ctx.dir, { [U(1)]: read(ctx.dir, U(1)).replace('board: { tags: ["price list"] }', 'board: { tags: [] }') });
  commit(ctx.dir, 'no tag');
  const r = aidlc(ctx, 'sync');
  const u1 = bySummary(ctx, 'U-1');
  assert.deepEqual(u1.fields.labels.sort(), ['aidlc-U-1', 'api', 'standard'], r.out);
  assert.deepEqual(writes(ctx).at(-1).args, ['edit', '--key', u1.key, '--labels', 'standard,api,aidlc-U-1', '--remove-labels', 'price-list', '--yes', '--json']);
});

test('B268/AC-3 next and status name sync while the Jira board is behind; with no jira section, sync never calls acli', () => {
  const ctx = setup();
  const behind = /^the board is behind: aidlc sync$/m;
  assert.match(aidlc(ctx, 'next').out, behind);
  aidlc(ctx, 'sync');
  assert.doesNotMatch(aidlc(ctx, 'status').out, behind);
  branch(ctx.dir, 'U-1', 'src/a/x.txt');
  spawnSync(process.execPath, [CLI, 'report', 'U-1'], { cwd: ctx.dir, input: '{"status": "done"}' });
  assert.match(aidlc(ctx, 'status').out, behind, 'a report moves U-1 to In Progress');

  const off = setup({ jira: null });
  const r = aidlc(off, 'sync');
  assert.equal(r.code, 64);
  assert.match(r.err, /no github section in the profile/);
  assert.doesNotMatch(aidlc(off, 'next').out, behind);
  assert.deepEqual(stub(off).calls, [], 'acli is never called');

  const github = setup({ jira: null, github: { repo: 'acme/shop' } });
  assert.equal(aidlc(github, 'sync').code, 0);
  assert.ok(JSON.parse(readFileSync(github.gh, 'utf8')).issues.length === 3, 'the GitHub board syncs');
  assert.deepEqual(stub(github).calls, [], 'with github alone, the Jira board is off');
});

test('B268/AC-3 with github and jira both set, sync writes both boards', () => {
  const ctx = setup({ github: { repo: 'acme/shop' } });
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(JSON.parse(readFileSync(ctx.gh, 'utf8')).issues.length, 3);
  assert.equal(stub(ctx).items.length, 3);
  assert.match(JSON.stringify(bySummary(ctx, 'U-1').fields.description), /https:\/\/github\.com\/acme\/shop\/blob\/main\/docs\/units\/U-1-export\.md/, 'the doc\'s link points at GitHub');
  assert.doesNotMatch(aidlc(ctx, 'next').out, /the board is behind/);
  assert.equal(aidlc(ctx, 'sync').out, 'the board is in sync\nthe board on KAN is in sync\n');
});

test('B268/AC-3 a failing acli reports its own error; after a merge it is a warning, never a failure', async () => {
  const ctx = setup();
  const failing = join(tempDir('acli-fails-'), 'acli-fails.mjs');
  writeFileSync(failing, 'process.stderr.write("unauthorized: run acli auth login\\n"); process.exit(1);\n');
  const profile = JSON.parse(read(ctx.dir, '.aidlc/profile.json'));
  commit(ctx.dir, 'a failing acli', { '.aidlc/profile.json': { ...profile, jira: { ...profile.jira, acli: [process.execPath, failing] } } });
  const r = aidlc(ctx, 'sync');
  assert.equal(r.code, 70);
  assert.match(r.err, /search --jql: unauthorized: run acli auth login/);
  const { readState, seam } = await import('../plugin/cli/lib/index.mjs');
  await import('../plugin/cli/aidlc.mjs'); // every extension plugs its seams
  const st = readState(ctx.dir);
  const after = seam('afterMerge', st.profile).map((f) => f(ctx.dir, st)).join('');
  assert.match(after, /^warning: the board on KAN did not sync, run aidlc sync: search --jql: unauthorized/);
});
