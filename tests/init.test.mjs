import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { commit, git, makeRepo, run, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN = JSON.parse(readFileSync(join(ROOT, 'plugin/.claude-plugin/plugin.json'), 'utf8'));

function emptyRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'init-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'owner@example.com');
  git(dir, 'config', 'user.name', 'Owner');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

function tree(dir, skip = []) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const rel = relative(dir, p).split(sep).join('/');
      if (name === '.git' || skip.some((s) => rel === s || rel.startsWith(s + '/'))) continue;
      if (statSync(p).isDirectory()) walk(p);
      else out[rel] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

const pinned = (dir, ...args) => run(dir, args.length ? args : ['check', '--ci']);

test('U5/AC-1 init on an empty repo writes a valid profile, a short AGENTS.md, a passing bundle and the pinned CLI', () => {
  const dir = emptyRepo();
  const r = run(dir, ['init', '--name', 'demo']);
  assert.equal(r.code, 0, r.err + r.out);
  const profile = JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8'));
  assert.deepEqual(profile, { name: 'demo', base: 'main', docs: { bundle: 'docs' }, modules: [], lanes: { quick: ['docs/**', '*.md'], full: [] }, focus: {} });
  assert.ok(readFileSync(join(dir, 'AGENTS.md'), 'utf8').split('\n').length <= 60);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  assert.equal(readFileSync(join(dir, '.aidlc/bin/VERSION'), 'utf8'), PLUGIN.version + '\n');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8')), { worktree: { baseRef: 'head' } });
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^\.aidlc\/local\/$/m);
  for (const t of ['requirement', 'intent', 'unit', 'decision']) assert.ok(existsSync(join(dir, `.aidlc/templates/docs/${t}.md`)), t);
  const check = run(dir, ['check']);
  assert.equal(check.code, 0, check.out);
  assert.equal(check.out, '', 'the new bundle passes with no warnings');
  assert.match(run(dir, ['next']).out, /^elaborate an intent/);
});

test('U5/AC-1 init never overwrites without asking', () => {
  const dir = emptyRepo();
  write(dir, { 'CLAUDE.md': '# my own notes\n', '.gitignore': 'node_modules/\n', '.claude/settings.json': { worktree: { baseRef: 'fresh' }, model: 'opus' } });
  const r = run(dir, ['init']);
  assert.equal(r.code, 2, 'the owner decides about the kept file');
  assert.match(r.out, /^kept CLAUDE\.md: it exists; rerun with --overwrite CLAUDE\.md to replace it$/m);
  assert.match(r.out, /^kept worktree\.baseRef in \.claude\/settings\.json: it is set to "fresh"$/m);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '# my own notes\n');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8')), { worktree: { baseRef: 'fresh' }, model: 'opus' });
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\n.aidlc/local/\n.claude/worktrees/\n', 'lines are added, nothing replaced');

  const again = run(dir, ['init', '--overwrite', 'CLAUDE.md', '--overwrite', 'AGENTS.md', '--overwrite', '.aidlc/profile.json',
    ...['requirement', 'intent', 'unit', 'decision'].flatMap((t) => ['--overwrite', `.aidlc/templates/docs/${t}.md`]),
    '--overwrite', 'docs/index.md', '--overwrite', 'docs/log.md', '--overwrite', '.github/workflows/aidlc.yml']);
  assert.equal(again.code, 0, again.out);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  assert.equal(run(dir, ['init', '--name']).code, 64);
  assert.equal(run(dir, ['init', '--bogus']).code, 64);
});

test('U5/AC-2 rendered files contain no plugin name', () => {
  const dir = emptyRepo();
  run(dir, ['init', '--name', 'demo']);
  for (const [file, text] of Object.entries(tree(dir))) {
    assert.ok(!text.toLowerCase().includes(PLUGIN.name.toLowerCase()), `${file} names the plugin`);
  }
});

test('U5/AC-3 upgrade replaces .aidlc/bin and nothing else; the pinned copy cannot upgrade itself', () => {
  const dir = emptyRepo();
  run(dir, ['init']);
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '0.0.1\n');
  writeFileSync(join(dir, '.aidlc/bin/stale.mjs'), '// old\n');
  writeFileSync(join(dir, 'AGENTS.md'), '# edited by the project\n');
  const before = tree(dir, ['.aidlc/bin']);
  const r = run(dir, ['upgrade']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(tree(dir, ['.aidlc/bin']), before);
  assert.equal(readFileSync(join(dir, '.aidlc/bin/VERSION'), 'utf8'), PLUGIN.version + '\n');
  assert.ok(!existsSync(join(dir, '.aidlc/bin/stale.mjs')));
  const self = run(dir, ['upgrade']);
  assert.equal(self.code, 0);
  const own = (args) => {
    const { spawnSync } = process.getBuiltinModule('node:child_process');
    return spawnSync(process.execPath, [join(dir, '.aidlc/bin/aidlc.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  };
  assert.equal(own(['upgrade']).status, 64);
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '99.0.0\n');
  const older = run(dir, ['upgrade']);
  assert.equal(older.code, 64, 'an older plugin never replaces a newer pinned CLI');
  assert.match(older.err, /older than the pinned CLI 99\.0\.0/);
  assert.equal(run(dir, ['upgrade', '--downgrade']).code, 0);
  assert.equal(readFileSync(join(dir, '.aidlc/bin/VERSION'), 'utf8'), PLUGIN.version + '\n');
});

test('U5/AC-4 and AC-6 init --adopt keeps the layout, records the adoption commit and lists leftovers', () => {
  const kb = 'handbook/kb';
  const dir = makeRepo({
    [`${kb}/index.md`]: '---\nokf_version: "0.2"\n---\n\nHand-written intro.\n\n# Requirement\n\n* [R-001](requirements/R-001.md) - Platform.\n',
    [`${kb}/requirements/R-001.md`]: '---\ntype: Requirement\ntitle: Platform\n---\n\n- AC-1 (integration): holds.\n',
    [`${kb}/decisions/0001-x.md`]: '---\ntype: Decision\ntitle: 0001 X\ndescription: X.\n---\n',
    '.oldtool/tracker.json': '{}',
  });
  git(dir, 'rm', '-q', '-r', '.aidlc');
  git(dir, 'commit', '-q', '-m', 'old work', '-m', 'Tracked-by: tool:agent\nReviewed-by: someone');
  const before = tree(dir, []);
  const head = git(dir, 'rev-parse', 'HEAD');

  const r = run(dir, ['init', '--adopt']);
  assert.equal(r.code, 0, r.err + r.out);
  const profile = JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8'));
  assert.equal(profile.docs.bundle, kb);
  assert.equal(profile.adopted, head);
  assert.deepEqual(profile.lanes.quick, [`${kb}/**`, '*.md']);
  for (const [file, text] of Object.entries(before)) assert.equal(readFileSync(join(dir, file), 'utf8'), text, `${file} changed`);
  assert.match(r.out, new RegExp(`^adopted the bundle at ${kb} as of ${head}$`, 'm'));
  assert.match(r.out, /^bundle: 0 spec errors, \d+ house-rule warnings/m);
  assert.match(r.out, /^leftover: \.oldtool\/ is not a known folder; left untouched$/m);
  assert.match(r.out, /^leftover: commit trailer Tracked-by in 1 commits/m);
  assert.doesNotMatch(r.out, /^leftover: .*(Reviewed-by|\.aidlc|\.claude|\.git)/m);

  assert.equal(run(emptyRepo(), ['init', '--adopt']).code, 64, 'no bundle to adopt');
});

test('U5/AC-5 with the plugin removed, the pinned CLI still checks the project', () => {
  const dir = emptyRepo();
  run(dir, ['init', '--name', 'demo']);
  commit(dir, 'adopt the workflow');
  const copy = join(mkdtempSync(join(tmpdir(), 'noplugin-')), 'p');
  cpSync(dir, copy, { recursive: true });
  const { spawnSync } = process.getBuiltinModule('node:child_process');
  const r = spawnSync(process.execPath, ['.aidlc/bin/aidlc.mjs', 'check', '--ci'], { cwd: copy, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(spawnSync(process.execPath, ['.aidlc/bin/aidlc.mjs', 'next'], { cwd: copy, encoding: 'utf8' }).status, 2);
});
