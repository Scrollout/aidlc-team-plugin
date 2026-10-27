// The runtime store under the git common dir (`.git/aidlc`): verdicts, reports, gates, heartbeats and counters,
// shared by every worktree and never committed (docs/design/state.md).
import { createHash } from 'node:crypto';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config, readJson } from './data.mjs';
import { git } from './git.mjs';

const S = config.state;

export const aidlcDir = (cwd) => join(resolve(cwd, git(cwd, 'rev-parse', '--git-common-dir')), S.dir);
export const runtimeFile = (cwd, kind, unit) => join(aidlcDir(cwd), S[kind], `${unit}.json`);
export const ciFile = (cwd) => join(aidlcDir(cwd), S.ci); // the base's last CI poll (docs/design/base-ci.md)
export const baseRedFile = (cwd) => join(aidlcDir(cwd), S.baseRed); // a level the gate found red on the base alone

export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
// Bounded runtime counters the retro reads and resets (docs/design/steering.md#3-across-intents-the-retro).
export const statsFile = (cwd) => join(aidlcDir(cwd), config.retro.stats);
export function bump(cwd, kind, key) {
  const st = readJson(statsFile(cwd)) ?? {}; // `since` is the last retro's reset
  if (config.retro.lists.includes(kind)) st[kind] = [...(st[kind] ?? []), key].slice(-config.retro.keep);
  else st[kind] = { ...st[kind], [key]: (st[kind]?.[key] ?? 0) + 1 };
  writeJson(statsFile(cwd), st);
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export const heartbeatAt = (cwd, unit, kind = S.heartbeats) => statSync(join(aidlcDir(cwd), kind, unit), { throwIfNoEntry: false })?.mtimeMs ?? 0;
export const heartbeatFresh = (cwd, unit, now = Date.now(), kind = S.heartbeats) => now - heartbeatAt(cwd, unit, kind) < S.heartbeatMs;
export const hostDeniedFile = (cwd) => join(aidlcDir(cwd), S.hostDenied);
