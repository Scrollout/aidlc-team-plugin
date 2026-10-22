// Runs one hook through the project's pinned CLI (docs/design/hooks.md).
// A folder without .aidlc/profile.json is not managed: allow. A managed one without its CLI: deny.
// Its one message is inline: it is printed exactly when the CLI and its cli.json are missing.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const name = process.argv[2];
const input = readFileSync(0, 'utf8');
let dir = JSON.parse(input || '{}').cwd ?? process.cwd();
while (!existsSync(join(dir, '.aidlc', 'profile.json')) && dirname(dir) !== dir) dir = dirname(dir);
if (!existsSync(join(dir, '.aidlc', 'profile.json'))) process.exit(0);
const cli = join(dir, '.aidlc', 'bin', 'aidlc.mjs');
if (!existsSync(cli)) {
  process.stderr.write('HOOK-CLI the pinned CLI .aidlc/bin/aidlc.mjs is missing → restore it with the plugin\'s upgrade\n');
  process.exit(2);
}
const r = spawnSync(process.execPath, [cli, 'hook', name], { cwd: dir, input, encoding: 'utf8' });
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
process.exit(r.status === 0 ? 0 : 2);
