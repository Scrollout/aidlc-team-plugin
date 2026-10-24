// Runs one hook through the project's pinned CLI (docs/design/hooks.md).
// A folder without .aidlc/profile.json is not managed: allow. A managed one without its CLI: a tool call is
// denied and other events pass, so the Stop hook cannot loop. Its one message is inline: it is printed exactly
// when the CLI and its cli.json are missing. A failed prompt hook (an older pinned CLI) passes the prompt unchanged.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const name = process.argv[2];
const advisory = 'heartbeat'; // only marks an agent in flight: it never blocks a tool call
const input = readFileSync(0, 'utf8');
const event = JSON.parse(input || '{}');
let dir = event.cwd ?? process.cwd();
while (!existsSync(join(dir, '.aidlc', 'profile.json')) && dirname(dir) !== dir) dir = dirname(dir);
if (!existsSync(join(dir, '.aidlc', 'profile.json'))) process.exit(0);
const cli = join(dir, '.aidlc', 'bin', 'aidlc.mjs');
if (!existsSync(cli)) {
  const upgrade = `node ${join(import.meta.dirname, '..', 'cli', 'aidlc.mjs')} upgrade`;
  process.stderr.write(`HOOK-CLI the pinned CLI .aidlc/bin/aidlc.mjs is missing → ask the owner to restore it from a terminal: ${upgrade}\n`);
  process.exit(name !== advisory && (event.hook_event_name === 'PreToolUse' || !event.hook_event_name) ? 2 : 0);
}
const r = spawnSync(process.execPath, [cli, 'hook', name], { cwd: dir, input, encoding: 'utf8' });
if (r.status !== 0 && event.hook_event_name === 'UserPromptSubmit') process.exit(0);
process.stdout.write(name === 'status' && r.status === 0 ? withUpgrade(r.stdout) : r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
process.exit(r.status === 0 || name === advisory ? 0 : 2);

// The session-start status names an upgrade when the pinned CLI is older than this installed plugin, with the
// command that works: the pinned copy refuses to upgrade itself. Inline, as an older pinned CLI cannot say it.
function withUpgrade(out) {
  const version = (file) => (existsSync(file) ? readFileSync(file, 'utf8').trim() : '');
  const pinned = version(join(dir, '.aidlc', 'bin', 'VERSION'));
  const installed = JSON.parse(version(join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json')) || '{}').version ?? '';
  const older = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); const k = x.findIndex((n, i) => n !== y[i]); return k >= 0 && x[k] < y[k]; };
  if (!/^\d+\.\d+\.\d+$/.test(pinned) || !/^\d+\.\d+\.\d+$/.test(installed) || !older(pinned, installed)) return out;
  const json = JSON.parse(out);
  const upgrade = `node ${join(import.meta.dirname, '..', 'cli', 'aidlc.mjs')} upgrade`;
  let auto = [];
  try { auto = JSON.parse(readFileSync(join(dir, '.aidlc', 'local', 'profile.json'), 'utf8')).approvals?.auto ?? []; } catch {}
  const step = auto.includes('upgrade') ? 'the owner delegated upgrades: run' : 'ask the owner to approve the upgrade, then run';
  json.hookSpecificOutput.additionalContext += `The pinned CLI is ${pinned}, the installed plugin ${installed} → between units, ${step} ${upgrade} (the pinned aidlc refuses it) and commit.\n`;
  return JSON.stringify(json);
}
