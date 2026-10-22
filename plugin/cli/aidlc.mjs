#!/usr/bin/env node
// Entry point: dispatches subcommands and maps errors to exit codes. Values and messages come from cli.json.
import { pathToFileURL } from 'node:url';
import { config } from './lib/config.mjs';
import { msg } from './lib/template.mjs';

export const EXIT = config.exit;

export class UsageError extends Error {}

// Each unit that builds a command adds its handler here, keyed by the command name in cli.json.
const HANDLERS = {};

export function help() {
  const width = Math.max(...config.commands.map((c) => c.usage.length));
  return msg('help', { commands: config.commands.map((c) => ({ ...c, usage: c.usage.padEnd(width) })) });
}

export async function main(argv, io = { out: process.stdout, err: process.stderr }) {
  const [name, ...args] = argv;
  if (config.helpFlags.includes(name)) {
    io.out.write(help());
    return EXIT.ok;
  }
  if (!name) {
    io.err.write(help());
    return EXIT.usage;
  }
  if (!config.commands.some((c) => c.name === name)) {
    io.err.write(msg('unknownCommand', { name }));
    return EXIT.usage;
  }
  const run = HANDLERS[name];
  if (!run) {
    io.err.write(msg('notBuilt', { name }));
    return EXIT.internal;
  }
  try {
    return await run(args, io);
  } catch (e) {
    io.err.write(msg('failed', { name, error: e.message }));
    return e instanceof UsageError ? EXIT.usage : EXIT.internal;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
