// Runs one hook through the project's pinned CLI (docs/design/hooks.md).
// A folder without .aidlc/profile.json is not managed: allow. A managed one without its CLI: a tool call is
// denied and other events pass, so the Stop hook cannot loop. Its one message is inline: it is printed exactly
// when the CLI and its cli.json are missing. A failed prompt hook (an older pinned CLI) passes the prompt unchanged.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const name = process.argv[2];
const input = readFileSync(0, 'utf8');
const event = JSON.parse(input || '{}');
let dir = event.cwd ?? process.cwd();
while (!existsSync(join(dir, '.aidlc', 'profile.json')) && dirname(dir) !== dir) dir = dirname(dir);
if (!existsSync(join(dir, '.aidlc', 'profile.json'))) process.exit(0);
const cli = join(dir, '.aidlc', 'bin', 'aidlc.mjs');
if (!existsSync(cli)) {
  const upgrade = `node ${join(import.meta.dirname, '..', 'cli', 'aidlc.mjs')} upgrade`;
  process.stderr.write(`HOOK-CLI the pinned CLI .aidlc/bin/aidlc.mjs is missing → ask the owner to restore it from a terminal: ${upgrade}\n`);
  process.exit(event.hook_event_name === 'PreToolUse' || !event.hook_event_name ? 2 : 0);
}
const r = spawnSync(process.execPath, [cli, 'hook', name], { cwd: dir, input, encoding: 'utf8' });
if (r.status !== 0 && event.hook_event_name === 'UserPromptSubmit') process.exit(0);
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
process.exit(r.status === 0 ? 0 : 2);
