#!/usr/bin/env node
// Entry point: dispatches subcommands, renders their data, maps errors to exit codes; handlers return { code, findings, output } (decision 0006).
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import './lib/index.mjs'; // the core, its rules plugged in first
import { config, EXTENSIONS_DIR, extensionNames, UsageError } from './lib/foundation/data.mjs';
import { msg } from './lib/foundation/text.mjs';
import { commands as okf } from './lib/domains/bundle.mjs';
import { commands as grid } from './lib/domains/plan.mjs';
import { commands as state } from './lib/domains/flow.mjs';
import { commands as approval } from './lib/domains/approval.mjs';
import { commands as review } from './lib/domains/review.mjs';
import { commands as card } from './lib/domains/card.mjs';
import { commands as init } from './lib/domains/setup.mjs';
import { commands as gate, planCheck, withSummary } from './lib/domains/gate.mjs';
import { commands as hooks, ownerRefused } from './lib/domains/host.mjs';
import { commands as naming } from './lib/domains/naming.mjs';
import { commands as inception } from './lib/domains/inception.mjs';
import { commands as map } from './lib/domains/map.mjs';
import { commands as method } from './lib/domains/method.mjs';

const EXIT = config.exit;
// Every extension the vendored copy carries: each plugs into the core's seams and may add commands (docs/design/library.md#extensions).
const extensions = await Promise.all(extensionNames.map((name) => import(pathToFileURL(join(EXTENSIONS_DIR, name, config.extensions.entry)).href)));

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
export const HANDLERS = { ...okf, ...state, ...approval, ...review, ...card, ...init, ...gate, ...hooks, ...map, ...naming, ...inception, ...method, ...Object.assign({}, ...extensions.map((x) => x.commands ?? {})), lane: grid.lane, check: withSummary(combine(okf.check, planCheck, gate.check)) };

function help() {
  const width = Math.max(...config.commands.map((c) => c.usage.length));
  return msg('help', { commands: config.commands.map((c) => ({ ...c, usage: c.usage.padEnd(width) })) });
}

async function main(argv, io = { out: process.stdout, err: process.stderr, cwd: process.cwd() }) {
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
  try {
    // The real long path, as git reports it: no Windows short names or symlinks (docs/design/cli.md).
    const result = await HANDLERS[name](args, { cwd: realpathSync.native(io.cwd ?? process.cwd()) });
    io.out.write(result.output + result.findings.map((f) => msg('finding', f)).join(''));
    return result.code;
  } catch (e) {
    io.err.write(msg('failed', { name, error: e.message }));
    if (config.hooks.owner.includes(name)) try { ownerRefused(realpathSync.native(io.cwd ?? process.cwd()), argv.join(' ')); } catch {} // outside a project there is no prompt
    return e instanceof UsageError ? EXIT.usage : EXIT.internal;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) { // import.meta.url is the real path
  process.exitCode = await main(process.argv.slice(2));
}
