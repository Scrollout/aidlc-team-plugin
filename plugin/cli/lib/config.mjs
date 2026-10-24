// Loads cli.json, the one place for commands, exit codes, paths and messages (docs/design/cli.md).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(readFileSync(join(CLI_DIR, 'cli.json'), 'utf8'));
export const PLUGIN_DIR = resolve(CLI_DIR, config.pluginRoot);
export const VERDICT = config.state.verdicts; // a reviewer's verdicts, by name
export const [QUICK, STANDARD, FULL] = config.gate.lanes; // the lanes, lowest first

// Bad usage: the CLI exits with config.exit.usage.
export class UsageError extends Error {}

// Helpers every module shares.
export const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]).map(String);
export const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
export const at = (obj, path) => path.split('.').reduce((v, k) => (isMap(v) ? v[k] : undefined), obj);
// The frontmatter paths a board field map reads.
export const fieldPaths = (fields) => Object.values(fields ?? {}).map((spec) => (typeof spec === 'string' ? spec : spec.from));
// A path as the CLI shows and stores it: relative, with `/` on every platform (docs/design/cli.md).
export const posix = (p) => p.split(sep).join('/');
export const relPath = (from, to) => posix(relative(from, to));
export const bundleOf = (cwd, profile) => resolve(cwd, profile.docs.bundle);
export const slug = (text, words) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, words).join('-');
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };
// The lines git prints, none when it fails.
export const gitLines = (cwd, ...args) => (tryGit(cwd, ...args) ?? '').split('\n').filter(Boolean);
// A project command, as the shell runs it: { status, stdout, stderr }.
export const sh = (cwd, command) => spawnSync(command, { cwd, shell: true, encoding: 'utf8' });
// A command's stdin: the test's, or the process's.
export const readStdin = (ctx) => (ctx.stdin ? ctx.stdin() : readFileSync(0, 'utf8'));
export const done = (output, code = config.exit.ok, findings = []) => ({ code, findings, output });
