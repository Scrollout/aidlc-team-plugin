// Builds throwaway git repos in a temp dir for the state and card tests.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CLI = join(import.meta.dirname, '..', 'plugin/cli/aidlc.mjs');
export const RUN = join(import.meta.dirname, '..', 'plugin/hooks/run.mjs');

// Every temp folder of a test process, and of the CLI it runs, sits under one root removed when the process ends,
// also after a failure, so a run leaves none behind.
export const TMP = mkdtempSync(join(tmpdir(), 'aidlc-test-'));
process.on('exit', () => rmSync(TMP, { recursive: true, force: true, maxRetries: 5 }));
export const tempDir = (prefix) => mkdtempSync(join(TMP, prefix));
const TMP_ENV = { TMPDIR: TMP, TMP, TEMP: TMP };

export const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Without NODE_TEST_CONTEXT, project commands that run `node --test` behave as they would outside this suite.
const { NODE_TEST_CONTEXT, ...ENV } = process.env;
const CHILD_ENV = { ...ENV, ...TMP_ENV };

export function run(dir, args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', input, env: CHILD_ENV });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// One hook call with `input` on stdin, as Claude Code makes it: through run.mjs and the project's pinned CLI, or,
// with `{ pinned: false }`, through this plugin's CLI for a project that pins none. `json` is its parsed output.
export function hook(name, input, { pinned = true } = {}) {
  const args = pinned ? [RUN, name] : [CLI, 'hook', name];
  const r = spawnSync(process.execPath, args, { cwd: input.cwd, encoding: 'utf8', input: JSON.stringify({ session_id: 's1', ...input }), env: CHILD_ENV });
  const out = r.stdout.trim();
  return { code: r.status, out: r.stdout, err: r.stderr, json: out ? JSON.parse(out) : {} };
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

export function unitDoc({ intent = 'I-1', depends = [], scope = ['src/**'], modules = [], acs = ['- AC-1 (unit): it works.'], title = 'Unit', extra = '', twoWay = '' } = {}) {
  const fm = ['type: Unit', `title: ${title}`, `description: ${title} goal.`];
  if (intent) fm.push(`intent: ${intent}`);
  if (depends.length) fm.push(`depends: [${depends.join(', ')}]`);
  fm.push(`scope: [${scope.map((s) => `"${s}"`).join(', ')}]`);
  if (modules.length) fm.push(`modules: [${modules.join(', ')}]`);
  if (twoWay) fm.push(`twoWay: "${twoWay}"`);
  return `---\n${fm.join('\n')}\n---\n\n# Acceptance criteria\n\n${acs.join('\n')}\n${extra}`;
}

// A repo on `main` with a profile, the given docs committed, and a git identity.
export function makeRepo(docs = {}, profile = {}, parent = TMP) {
  const dir = mkdtempSync(join(parent, 'state-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'owner@example.com');
  git(dir, 'config', 'user.name', 'Owner');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.autocrlf', 'false'); // tests compare bytes; the CLI itself reads CRLF docs as LF
  commit(dir, 'init', { '.aidlc/profile.json': profile, ...docs });
  return dir;
}

// makeRepo with the CLI pinned and committed, as `upgrade` leaves a managed project for the hooks.
export function pinnedRepo(docs, profile, parent) {
  const dir = makeRepo(docs, profile, parent);
  const r = run(dir, ['upgrade', '--dirty']);
  if (r.code !== 0) throw new Error(r.err);
  commit(dir, 'pin the CLI');
  return dir;
}

export function approve(dir, ...ids) {
  const r = run(dir, ['approve', ...ids]);
  if (r.code !== 0) throw new Error(r.err);
  return commit(dir, `approve ${ids.join(' ')}`);
}

// A unit branch with one commit carrying the AC-1 tag, then back on main.
export function branch(dir, unit, file = `src/${unit}.txt`) {
  git(dir, 'switch', '-q', '-c', `unit/${unit}`);
  commit(dir, `work on ${unit}`, { [file]: `${unit}/AC-1\n` });
  git(dir, 'switch', '-q', 'main');
}

export function merge(dir, unit) {
  git(dir, 'merge', '-q', '--no-ff', `unit/${unit}`, '-m', `Merge ${unit}`, '-m', `Unit: ${unit}`);
}

export function review(dir, unit, verdict, findings = []) {
  const file = join(tempDir('verdict-'), 'verdict.json');
  writeFileSync(file, JSON.stringify({ verdict, findings }));
  const r = run(dir, ['review', 'record', unit, file]);
  if (r.code !== 0) throw new Error(r.err);
}

export const aidlc = (dir) => join(dir, '.git', 'aidlc');

// The state tests' plan: I-1 and U-<n> docs, and a base with U-2 depending on U-1.
export const U = (n) => `docs/units/U-${n}-u${n}.md`;
export const I1 = { 'docs/intents/I-1-pricing.md': intentDoc('I-1') };
export const twoUnits = () => makeRepo({ ...I1, [U(1)]: unitDoc({ scope: ['a/**'] }), [U(2)]: unitDoc({ scope: ['b/**'], depends: ['U-1'] }) });

// A builder's heartbeat for `unit`, `ageMs` old.
export function heartbeat(dir, unit, ageMs = 0) {
  write(dir, { [`.git/aidlc/heartbeats/${unit}`]: '' });
  const t = (Date.now() - ageMs) / 1000;
  utimesSync(join(aidlc(dir), 'heartbeats', unit), t, t);
}

export function report(dir, unit) {
  const r = run(dir, ['report', unit], JSON.stringify({ status: 'done', summary: 'ok' }));
  if (r.code !== 0) throw new Error(r.err);
}
