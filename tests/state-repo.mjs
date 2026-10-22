// Builds throwaway git repos in a temp dir for the state and card tests.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CLI = join(import.meta.dirname, '..', 'plugin/cli/aidlc.mjs');

export const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function run(dir, args, input) {
  // Without NODE_TEST_CONTEXT, project commands that run `node --test` behave as they would outside this suite.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', input, env });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

export function write(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), typeof text === 'string' ? text : JSON.stringify(text, null, 2));
  }
}

export const read = (dir, rel) => readFileSync(join(dir, rel), 'utf8');

export function commit(dir, message, files = {}) {
  write(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', message);
  return git(dir, 'rev-parse', 'HEAD');
}

export function intentDoc(id, title = 'Pricing') {
  return `---\ntype: Intent\ntitle: ${title}\ndescription: ${title} for more regions.\n---\n\n# Goal\n\nSell in more regions.\n`;
}

export function unitDoc({ intent = 'I-1', depends = [], scope = ['src/**'], modules = [], acs = ['- AC-1 (unit): it works.'], title = 'Unit', extra = '' } = {}) {
  const fm = ['type: Unit', `title: ${title}`, `description: ${title} goal.`];
  if (intent) fm.push(`intent: ${intent}`);
  if (depends.length) fm.push(`depends: [${depends.join(', ')}]`);
  fm.push(`scope: [${scope.map((s) => `"${s}"`).join(', ')}]`);
  if (modules.length) fm.push(`modules: [${modules.join(', ')}]`);
  return `---\n${fm.join('\n')}\n---\n\n# Acceptance criteria\n\n${acs.join('\n')}\n${extra}`;
}

// A repo on `main` with a profile, the given docs committed, and a git identity.
export function makeRepo(docs = {}, profile = {}, parent = tmpdir()) {
  const dir = mkdtempSync(join(parent, 'state-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'owner@example.com');
  git(dir, 'config', 'user.name', 'Owner');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false'); // tests compare bytes; the CLI itself reads CRLF docs as LF
  commit(dir, 'init', { '.aidlc/profile.json': profile, ...docs });
  return dir;
}

export function approve(dir, ...ids) {
  const r = run(dir, ['approve', ...ids]);
  if (r.code !== 0) throw new Error(r.err);
  return commit(dir, `approve ${ids.join(' ')}`);
}

// A unit branch with one commit, then back on main.
export function branch(dir, unit, file = `src/${unit}.txt`) {
  git(dir, 'switch', '-q', '-c', `unit/${unit}`);
  commit(dir, `work on ${unit}`, { [file]: `${unit}\n` });
  git(dir, 'switch', '-q', 'main');
}

export function merge(dir, unit) {
  git(dir, 'merge', '-q', '--no-ff', `unit/${unit}`, '-m', `Merge ${unit}`, '-m', `Unit: ${unit}`);
}

export function review(dir, unit, verdict, findings = []) {
  const file = join(mkdtempSync(join(tmpdir(), 'verdict-')), 'verdict.json');
  writeFileSync(file, JSON.stringify({ verdict, findings }));
  const r = run(dir, ['review', 'record', unit, file]);
  if (r.code !== 0) throw new Error(r.err);
}

export const aidlc = (dir) => join(dir, '.git', 'aidlc');
