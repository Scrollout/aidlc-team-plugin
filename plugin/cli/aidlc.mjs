#!/usr/bin/env node
// Entry point: dispatches subcommands and maps errors to exit codes.
import { pathToFileURL } from 'node:url';

export const EXIT = { ok: 0, findings: 1, blocked: 2, usage: 64, internal: 70 };

export class UsageError extends Error {}

// Order and wording follow docs/design/cli.md. `run` is added by the unit that builds each command.
export const COMMANDS = [
  { name: 'init', usage: 'init', does: 'ask questions, write the profile, render templates, vendor the CLI' },
  { name: 'upgrade', usage: 'upgrade', does: 're-vendor the CLI from the installed plugin' },
  { name: 'index', usage: 'index', does: 'regenerate every index.md in the bundle' },
  { name: 'check', usage: 'check [--ci] [--staged] [path…]', does: 'OKF validation, plan lint, profile lint' },
  { name: 'status', usage: 'status', does: 'print the state table' },
  { name: 'next', usage: 'next', does: 'print the single next action' },
  { name: 'lane', usage: 'lane <unit>|--diff <range>', does: 'print the computed lane and why' },
  { name: 'card', usage: 'card <unit>', does: 'render the unit card' },
  { name: 'start', usage: 'start <unit>', does: 'name the worktree branch unit/U-<n> and check its base' },
  { name: 'reserve', usage: 'reserve <kind> <area>', does: 'next free number for a reservation' },
  { name: 'approve', usage: 'approve <doc>', does: 'stamp approval (owner only)' },
  { name: 'review', usage: 'review record <unit> <file>', does: 'store a reviewer verdict keyed by diff hash' },
  { name: 'report', usage: 'report <unit>', does: "store the builder's report (JSON on stdin)" },
  { name: 'hold', usage: 'hold <unit>', does: 'record an owner hold in the plan' },
  { name: 'priority', usage: 'priority <unit> <n>', does: 'record an owner priority in the plan' },
  { name: 'fix', usage: 'fix "<title>"', does: 'create a one-unit plan without an intent' },
  { name: 'push', usage: 'push', does: 'push the base after checking its new commits' },
  { name: 'clean', usage: 'clean', does: 'remove orphan worktrees and branches' },
  { name: 'merge', usage: 'merge <unit>', does: 'run the merge gate, then merge --no-ff with trailers' },
  { name: 'hook', usage: 'hook <name>', does: 'entry point for hooks; reads the hook JSON on stdin' },
];

export function help() {
  const width = Math.max(...COMMANDS.map((c) => c.usage.length));
  return ['usage: aidlc <command> [args]', '', ...COMMANDS.map((c) => `  ${c.usage.padEnd(width)}  ${c.does}`)].join('\n') + '\n';
}

export async function main(argv, io = { out: process.stdout, err: process.stderr }) {
  const [name, ...args] = argv;
  if (name === '--help' || name === '-h' || name === 'help') {
    io.out.write(help());
    return EXIT.ok;
  }
  if (!name) {
    io.err.write(help());
    return EXIT.usage;
  }
  const cmd = COMMANDS.find((c) => c.name === name);
  if (!cmd) {
    io.err.write(`unknown command: ${name} → run aidlc --help\n`);
    return EXIT.usage;
  }
  if (!cmd.run) {
    io.err.write(`${name}: not implemented yet\n`);
    return EXIT.internal;
  }
  try {
    return await cmd.run(args, io);
  } catch (e) {
    io.err.write(`${name}: ${e.message}\n`);
    return e instanceof UsageError ? EXIT.usage : EXIT.internal;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
