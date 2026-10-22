// Loads cli.json, the one place for commands, exit codes, paths and messages (docs/design/cli.md).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(readFileSync(join(CLI_DIR, 'cli.json'), 'utf8'));
export const PLUGIN_DIR = resolve(CLI_DIR, config.pluginRoot);

// Bad usage: the CLI exits with config.exit.usage.
export class UsageError extends Error {}
