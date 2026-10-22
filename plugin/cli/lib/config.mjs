// Loads cli.json, the one place for commands, exit codes, paths and messages (docs/design/cli.md).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(readFileSync(join(CLI_DIR, 'cli.json'), 'utf8'));
export const PLUGIN_DIR = resolve(CLI_DIR, config.pluginRoot);

// Bad usage: the CLI exits with config.exit.usage.
export class UsageError extends Error {}

// Helpers every module shares.
export const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]).map(String);
export const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
export const at = (obj, path) => path.split('.').reduce((v, k) => (isMap(v) ? v[k] : undefined), obj);
// The frontmatter paths a board field map reads.
export const fieldPaths = (fields) => Object.values(fields ?? {}).map((spec) => (typeof spec === 'string' ? spec : spec.from));
export const done = (output, code = config.exit.ok, findings = []) => ({ code, findings, output });
