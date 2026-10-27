// Git and the shell: git through execFileSync, never a shell; project commands from the profile through the shell.
import { execFileSync, spawnSync } from 'node:child_process';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };
// The lines git prints, none when it fails.
export const gitLines = (cwd, ...args) => (tryGit(cwd, ...args) ?? '').split('\n').filter(Boolean);
// Each line a diff range adds, with its file and line number (the merge gate, the security focus).
export function addedLines(cwd, range) {
  const out = [];
  let file = null;
  let line = 0;
  for (const l of gitLines(cwd, 'diff', '-U0', '--no-color', '--no-ext-diff', range)) {
    if (l.startsWith('+++ ')) file = l.slice(6);
    else if (l.startsWith('@@')) line = Number(l.match(/\+(\d+)/)?.[1]);
    else if (l.startsWith('+') && file) out.push({ file, line: line++, text: l.slice(1) });
  }
  return out;
}
// A project command, as the shell runs it: { status, stdout, stderr }.
export const sh = (cwd, command, env) => spawnSync(command, { cwd, shell: true, encoding: 'utf8', env: env && { ...process.env, ...env } });
