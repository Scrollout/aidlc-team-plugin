#!/usr/bin/env node
// Entry point and adapter: dispatches subcommands, renders their data and maps errors to exit codes.
// Values and messages come from cli.json; handlers return { code, findings, output } (decision 0006).
import { pathToFileURL } from 'node:url';
import { config, UsageError } from './lib/config.mjs';
import { msg } from './lib/template.mjs';
import { commands as okf } from './lib/okf.mjs';
import { commands as grid } from './lib/grid.mjs';
import { commands as state } from './lib/state.mjs';
import { commands as card } from './lib/card.mjs';
import { commands as init } from './lib/init.mjs';
import { commands as gate } from './lib/gate.mjs';
import { commands as hooks } from './lib/hooks.mjs';

export const EXIT = config.exit;
export { UsageError };

// Runs handlers in order and merges their results; the highest exit code wins.
const combine = (...handlers) => async (args, ctx) => {
  const results = [];
  for (const h of handlers) results.push(await h(args, ctx));
  return {
    code: Math.max(...results.map((r) => r.code)),
    findings: results.flatMap((r) => r.findings),
    output: results.map((r) => r.output).join(''),
  };
};

// Each unit that builds a command adds its handler here, keyed by the command name in cli.json.
const HANDLERS = { ...okf, ...state, ...card, ...init, ...gate, ...hooks, lane: grid.lane, check: combine(okf.check, grid.check, gate.check) };

export function help() {
  const width = Math.max(...config.commands.map((c) => c.usage.length));
  return msg('help', { commands: config.commands.map((c) => ({ ...c, usage: c.usage.padEnd(width) })) });
}

export async function main(argv, io = { out: process.stdout, err: process.stderr, cwd: process.cwd() }) {
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
    const result = await run(args, { cwd: io.cwd ?? process.cwd() });
    io.out.write(result.output + result.findings.map((f) => msg('finding', f)).join(''));
    return result.code;
  } catch (e) {
    io.err.write(msg('failed', { name, error: e.message }));
    return e instanceof UsageError ? EXIT.usage : EXIT.internal;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
