// Loads cli.json, the one place for commands, exit codes, paths and messages (docs/design/cli.md).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
// An escape hatch's `until` date that has passed (docs/design/construction.md#escape-hatches).
export const isoDay = (v) => String(v).split('T')[0];
export const lapsed = (until) => until !== undefined && until !== null && isoDay(until) < isoDay(new Date().toISOString());
export const slug = (text, words) => text.toLowerCase().split(new RegExp(config.okf.slugSplit)).filter(Boolean).slice(0, words).join('-');
// A command's stdin: the test's, or the process's.
export const readStdin = (ctx) => (ctx.stdin ? ctx.stdin() : readFileSync(0, 'utf8'));
export const done = (output, code = config.exit.ok, findings = []) => ({ code, findings, output });

// A shipped package's folder: the pinned copy's, else the plugin's beside the CLI (docs/design/layout.md).
export const shippedDir = (pkg) => [join(CLI_DIR, config.packages[pkg].dir), join(PLUGIN_DIR, config.packages[pkg].dir)].find(existsSync) ?? join(PLUGIN_DIR, config.packages[pkg].dir);
// A package's file: the project's own at the override path, else the shipped one (`shipped` for an extension's own).
export function packageFile(root, pkg, rel, shipped = shippedDir(pkg)) {
  const own = config.packages[pkg].override && join(root, config.packages[pkg].override, rel);
  return own && existsSync(own) ? own : join(shipped, rel);
}

// Each extension's data joins the core's: its codes, messages, commands and values (docs/design/library.md#extensions).
export const EXTENSIONS_DIR = join(CLI_DIR, config.extensions.dir);
export const extensionNames = existsSync(EXTENSIONS_DIR) ? readdirSync(EXTENSIONS_DIR).sort() : [];
const merge = (into, from) => {
  for (const [k, v] of Object.entries(from)) into[k] = Array.isArray(v) ? [...(into[k] ?? []), ...v] : isMap(v) && isMap(into[k]) ? merge(into[k], v) : v;
  return into;
};
for (const name of extensionNames) merge(config, readJson(join(EXTENSIONS_DIR, name, config.extensions.data))?.data ?? {});
