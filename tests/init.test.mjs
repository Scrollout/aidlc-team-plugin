import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { commit, git, makeRepo, run, tempDir, write } from './state-repo.mjs';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN = JSON.parse(readFileSync(join(ROOT, 'plugin/.claude-plugin/plugin.json'), 'utf8'));

function emptyRepo() {
  const dir = tempDir('init-');
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

test('U5/AC-1 U50/AC-1 init on an empty repo writes a valid profile, a short AGENTS.md, a passing bundle and the pinned CLI', () => {
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
  for (const t of ['requirement', 'intent', 'unit', 'decision', 'runbook', 'naming']) assert.ok(existsSync(join(dir, `.aidlc/templates/docs/${t}.md`)), t);
  const check = run(dir, ['check']);
  assert.equal(check.code, 0, check.out);
  assert.equal(check.out, '', 'the new bundle passes with no warnings');
  assert.match(run(dir, ['next']).out, /^👉 elaborate an intent/);
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
    ...['requirement', 'intent', 'unit', 'decision', 'runbook', 'naming'].flatMap((t) => ['--overwrite', `.aidlc/templates/docs/${t}.md`]),
    '--overwrite', 'docs/index.md', '--overwrite', 'docs/log.md', '--overwrite', 'docs/constitution/principles.md', '--overwrite', '.github/workflows/aidlc.yml']);
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

test('U97/AC-1 upgrade lists the findings the new release reports and the pinned one did not', () => {
  const dir = emptyRepo();
  run(dir, ['init']);
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '0.0.1\n');
  writeFileSync(join(dir, '.aidlc/bin/aidlc.mjs'), "console.log('docs/a.md:1 HOUSE-SIZE an old finding');\n"); // an older release that checks less
  const profile = JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8'));
  writeFileSync(join(dir, '.aidlc/profile.json'), JSON.stringify({ ...profile, modules: [{ id: 'core', paths: ['src/**'] }] }));
  const r = run(dir, ['upgrade', '--dirty']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, new RegExp(`${PLUGIN.version.replace(/\./g, '\\.')} reports findings the pinned release did not; plan a fix before the next merge:\n[\\s\\S]*\\.aidlc/profile\\.json:1 PROFILE-NAMES `));
  assert.doesNotMatch(run(dir, ['upgrade', '--dirty']).out, /reports findings the pinned release did not/, 'none new the second time');
});

test('U5/AC-3 upgrade replaces .aidlc/bin and changes nothing the project has; the pinned copy cannot upgrade itself', () => {
  const dir = emptyRepo();
  run(dir, ['init']);
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '0.0.1\n');
  writeFileSync(join(dir, '.aidlc/bin/stale.mjs'), '// old\n');
  writeFileSync(join(dir, 'AGENTS.md'), '# edited by the project\n');
  const before = tree(dir, ['.aidlc/bin']);
  const r = run(dir, ['upgrade', '--dirty']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(tree(dir, ['.aidlc/bin']), before);
  assert.equal(readFileSync(join(dir, '.aidlc/bin/VERSION'), 'utf8'), PLUGIN.version + '\n');
  assert.ok(!existsSync(join(dir, '.aidlc/bin/stale.mjs')));
  const self = run(dir, ['upgrade', '--dirty']);
  assert.equal(self.code, 0);
  const own = (args) => {
    const { spawnSync } = process.getBuiltinModule('node:child_process');
    return spawnSync(process.execPath, [join(dir, '.aidlc/bin/aidlc.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  };
  assert.equal(own(['upgrade']).status, 64);
  writeFileSync(join(dir, '.aidlc/bin/VERSION'), '99.0.0\n');
  const older = run(dir, ['upgrade', '--dirty']);
  assert.equal(older.code, 64, 'an older plugin never replaces a newer pinned CLI');
  assert.match(older.err, /older than the pinned CLI 99\.0\.0/);
  assert.equal(run(dir, ['upgrade', '--downgrade', '--dirty']).code, 0);
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
  const copy = join(tempDir('noplugin-'), 'p');
  cpSync(dir, copy, { recursive: true });
  const { spawnSync } = process.getBuiltinModule('node:child_process');
  const r = spawnSync(process.execPath, ['.aidlc/bin/aidlc.mjs', 'check', '--ci'], { cwd: copy, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(spawnSync(process.execPath, ['.aidlc/bin/aidlc.mjs', 'next'], { cwd: copy, encoding: 'utf8' }).status, 2);
});

test('U16/AC-2 upgrade copies a release: the installed copy or a clean checkout; a dirty checkout needs --dirty', () => {
  const dir = emptyRepo();
  assert.equal(run(dir, ['init']).code, 0);
  const { spawnSync } = process.getBuiltinModule('node:child_process');
  const from = (cli, ...args) => spawnSync(process.execPath, [join(cli, 'cli/aidlc.mjs'), 'upgrade', ...args], { cwd: dir, encoding: 'utf8' });

  const installed = join(tempDir('cache-'), PLUGIN.version);
  cpSync(join(ROOT, 'plugin'), installed, { recursive: true });
  assert.equal(from(installed).status, 0, 'the installed plugin is a release copy');

  const checkout = tempDir('checkout-');
  cpSync(join(ROOT, 'plugin'), join(checkout, 'plugin'), { recursive: true });
  for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'release']]) git(checkout, ...args);
  assert.equal(from(join(checkout, 'plugin')).status, 0, 'a clean checkout');
  writeFileSync(join(checkout, 'plugin/cli/lib/wip.mjs'), '// work in progress\n');
  const dirty = from(join(checkout, 'plugin'));
  assert.equal(dirty.status, 64);
  assert.match(dirty.stderr, /has uncommitted changes → upgrade from the installed plugin or a clean checkout, or pass --dirty on purpose/);
  assert.ok(!existsSync(join(dir, '.aidlc/bin/lib/wip.mjs')), 'nothing copied');
  assert.equal(from(join(checkout, 'plugin'), '--dirty').status, 0);
  assert.ok(existsSync(join(dir, '.aidlc/bin/lib/wip.mjs')));
});

test('U13/AC-2 U13/AC-3 init adds the worktree folder to the ignore files the project has and offers its lint target', () => {
  const dir = emptyRepo();
  writeFileSync(join(dir, '.dockerignore'), 'node_modules\r\n');
  writeFileSync(join(dir, 'Makefile'), 'test:\n\tgo test ./...\nlint: vet\n\tgolangci-lint run\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { lint: 'eslint .' } }));
  const r = run(dir, ['init']);
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(join(dir, '.dockerignore'), 'utf8'), 'node_modules\r\n.claude/worktrees/\n');
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^\.claude\/worktrees\/$/m);
  assert.ok(!existsSync(join(dir, '.prettierignore')), 'no ignore file is created');
  assert.match(r.out, /^make lint is the project's lint target → add it as a module check/m);
  assert.match(r.out, /^npm run lint is the project's lint target/m);
  assert.doesNotMatch(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8'), /lint/, 'the owner adds it');
  assert.doesNotMatch(run(dir, ['init']).out, /added \.claude\/worktrees\/ to \.dockerignore/, 'once');
});

test('U30/AC-1 U30/AC-2 upgrade says when nothing changed, where it copied from, and how to get a newer release', () => {
  const dir = emptyRepo();
  assert.equal(run(dir, ['init']).code, 0);
  const first = run(dir, ['upgrade', '--dirty']);
  assert.equal(first.code, 0, first.err);
  const again = run(dir, ['upgrade', '--dirty']);
  assert.match(again.out, new RegExp(`^the CLI is already ${PLUGIN.version.replace(/\./g, '\\.')} in \\.aidlc/bin: nothing changed$`, 'm'));
  assert.doesNotMatch(again.out, /^pinned the CLI/m);
  assert.match(again.out, new RegExp(`^copied from ${PLUGIN.version.replace(/\./g, '\\.')} at \\S+; for a newer release: claude plugin marketplace update, then claude plugin update ${PLUGIN.name}, restart, and upgrade again$`, 'm'));
});

test('U52/AC-1 init --run writes each level\'s run command; an unknown level or a value without = is refused', () => {
  const dir = emptyRepo();
  const r = run(dir, ['init', '--run', 'unit=npm test', '--run', 'e2e=npx playwright test']);
  assert.equal(r.code, 0, r.err + r.out);
  const profile = JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8'));
  assert.deepEqual(profile.levels, { unit: { run: 'npm test' }, e2e: { run: 'npx playwright test' } });
  for (const bad of ['smoke=make smoke', 'unit']) {
    const refused = run(emptyRepo(), ['init', '--run', bad]);
    assert.equal(refused.code, 64, bad);
    assert.match(refused.err, /--run takes <level>=<command> with a level from unit, integration, e2e/);
  }
});

test('U52/AC-2 without --run, init writes no run and offers each test command it detects', () => {
  const dir = emptyRepo();
  writeFileSync(join(dir, 'Makefile'), 'test:\n\tgo test ./...\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  writeFileSync(join(dir, 'go.mod'), 'module demo\n');
  const r = run(dir, ['init']);
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(readFileSync(join(dir, '.aidlc/profile.json'), 'utf8')).levels, undefined, 'nothing guessed into the profile');
  for (const command of ['npm test', 'make test', 'go test ./...']) assert.ok(r.out.includes(`${command} runs the tests → ask the owner how each level runs, offering: --run "unit=${command}"\n`), command);
  assert.doesNotMatch(run(emptyRepo(), ['init', '--run', 'unit=make test']).out, /runs the tests/, 'given, not offered');
  assert.match(readFileSync(join(ROOT, 'plugin/skills/aidlc/SKILL.md'), 'utf8'), /each test level's run command[^\n]*--run <level>=<command>/, 'the skill asks for them');
});

test('U52/AC-3 plan lint warns PLAN-RUN while no level has a run; a warning does not fail check', () => {
  const unit = '---\ntype: Unit\ntitle: A\ndescription: A.\nscope: ["src/**"]\ndesign: "none"\n---\n\n# Acceptance criteria\n\n- AC-1 (unit): x.\n';
  const dir = makeRepo({ 'docs/units/U-1-a.md': unit });
  const r = run(dir, ['check']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^\.aidlc\/profile\.json:1 PLAN-RUN no test level has a run command/m);
  const ran = makeRepo({ 'docs/units/U-1-a.md': unit }, { levels: { unit: { run: 'npm test' } } });
  assert.doesNotMatch(run(ran, ['check']).out, /PLAN-RUN/);
  assert.doesNotMatch(run(makeRepo({}), ['check']).out, /PLAN-RUN/, 'no units yet, nothing to warn about');
});

test('U53/AC-1 U53/AC-2 init writes a constitution naming only checks the CLI defines, indexes it, and AGENTS.md points to it', () => {
  const dir = emptyRepo();
  assert.equal(run(dir, ['init', '--name', 'demo']).code, 0);
  const text = readFileSync(join(dir, 'docs/constitution/principles.md'), 'utf8');
  assert.match(text, /^type: Principles$/m);
  assert.match(text, /^title: How demo is built$/m);
  assert.match(text, /^# Project rules$/m);
  const cli = JSON.parse(readFileSync(join(ROOT, 'plugin/cli/cli.json'), 'utf8'));
  const known = new Set([cli.okf, cli.grid, cli.gate, cli.hooks].flatMap((s) => Object.keys(s.codes)));
  const named = [...text.matchAll(/`([A-Z]+-[A-Z-]+)`/g)].map((m) => m[1]);
  assert.ok(named.length >= 10, named.join(' '));
  assert.deepEqual(named.filter((c) => !known.has(c)), [], 'every code it names exists');
  for (const code of ['PLAN-SLICE', 'PLAN-RUN', 'GATE-PROOF', 'GATE-SKIP', 'GATE-DEPENDENCY', 'CI-DEPENDENCY', 'ARCH-DATA', 'ARCH-API', 'ARCH-CYCLE', 'PROFILE-ARCH', 'GATE-IDENTITY']) assert.ok(named.includes(code), code); // U108/AC-2 rule 10
  assert.ok(text.includes('One slice never directly calls the internal database layer of another slice. If slices need to communicate, they do so through well-defined interfaces, events, or shared domain services.'), 'U105/AC-2 rule 9, word for word'); // U98/AC-2 rule 8
  assert.match(readFileSync(join(dir, '.github/workflows/aidlc.yml'), 'utf8'), /^ {2}schedule:\n {4}- cron: /m, 'U98/AC-2 daily');
  assert.match(readFileSync(join(dir, 'docs/index.md'), 'utf8'), /\[constitution\]\(constitution\/index\.md\)/);
  assert.match(readFileSync(join(dir, 'docs/constitution/index.md'), 'utf8'), /principles\.md/);
  const check = run(dir, ['check']);
  assert.equal(check.code, 0, check.out);
  assert.equal(check.out, '');
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /`docs\/constitution\/principles\.md`/);
  assert.ok(agents.split('\n').length <= 60);

  write(dir, { 'docs/constitution/principles.md': '---\ntype: Principles\ntitle: Ours\ndescription: Ours.\n---\n' });
  run(dir, ['init']);
  assert.match(readFileSync(join(dir, 'docs/constitution/principles.md'), 'utf8'), /^title: Ours$/m, 'an existing one is kept');
});

test('U54/AC-1 upgrade adds each doc template and the constitution a project lacks, indexes it, and overwrites nothing', () => {
  const dir = emptyRepo();
  run(dir, ['init', '--name', 'demo']);
  rmSync(join(dir, '.aidlc/templates/docs/runbook.md'));
  rmSync(join(dir, 'docs/constitution'), { recursive: true });
  run(dir, ['index']);
  writeFileSync(join(dir, '.aidlc/templates/docs/unit.md'), '# our own unit template\n');
  const r = run(dir, ['upgrade', '--dirty']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^added \.aidlc\/templates\/docs\/runbook\.md: the project lacked it$/m);
  assert.match(r.out, /^added docs\/constitution\/principles\.md: the project lacked it$/m);
  assert.equal((r.out.match(/^added /gm) ?? []).length, 2, 'only what was missing');
  assert.equal(readFileSync(join(dir, '.aidlc/templates/docs/unit.md'), 'utf8'), '# our own unit template\n');
  assert.match(readFileSync(join(dir, 'docs/constitution/principles.md'), 'utf8'), /^title: How demo is built$/m);
  assert.match(readFileSync(join(dir, 'docs/index.md'), 'utf8'), /\[constitution\]\(constitution\/index\.md\)/);
  assert.equal(run(dir, ['check']).out, '', 'the bundle passes');
  assert.doesNotMatch(run(dir, ['upgrade', '--dirty']).out, /^added /m, 'once');

  const own = emptyRepo();
  run(own, ['init']);
  rmSync(join(own, 'docs/constitution'), { recursive: true });
  write(own, { 'docs/handbook/rules.md': '---\ntype: Principles\ntitle: Ours\ndescription: Ours.\n---\n' });
  assert.doesNotMatch(run(own, ['upgrade', '--dirty']).out, /constitution/, 'a bundle with its own Principles doc keeps it');
  assert.ok(!existsSync(join(own, 'docs/constitution')));
});

test('U73/AC-1 the generated workflow takes the runner and action pins of the project\'s own workflows', () => {
  const plain = emptyRepo();
  assert.equal(run(plain, ['init', '--name', 'demo']).code, 0);
  const own = readFileSync(join(plain, '.github/workflows/aidlc.yml'), 'utf8');
  assert.match(own, /runs-on: ubuntu-latest\n/);
  assert.match(own, /- uses: actions\/checkout@v7\n/);

  const dir = emptyRepo();
  mkdirSync(join(dir, '.github/workflows'), { recursive: true });
  writeFileSync(join(dir, '.github/workflows/ci.yml'), 'jobs:\n  go:\n    runs-on: platform-kernel\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0\n');
  assert.equal(run(dir, ['init', '--name', 'demo']).code, 0);
  const matched = readFileSync(join(dir, '.github/workflows/aidlc.yml'), 'utf8');
  assert.match(matched, /runs-on: platform-kernel\n/);
  assert.match(matched, /- uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1\n/);
  assert.match(matched, /- uses: actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7\.1\.0\n/);
});
