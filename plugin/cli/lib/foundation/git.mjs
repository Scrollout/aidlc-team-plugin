// Git and the shell: git through execFileSync, never a shell; project commands from the profile through the shell.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };
// A branch's commit read from the repository's own files (a loose ref, then packed-refs, through a worktree's gitdir
// and commondir), null when the branch does not exist, and git's answer only when the files cannot be read:
// spawning git costs most of a hook's time on Windows.
export function branchSha(cwd, branch) {
  try {
    let dir = resolve(cwd), dotGit = null;
    while (!dotGit) {
      if (existsSync(join(dir, '.git'))) dotGit = join(dir, '.git');
      else if (dirname(dir) === dir) throw new Error('no repository');
      else dir = dirname(dir);
    }
    const gitDir = statSync(dotGit).isFile() ? resolve(dir, readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m)[1].trim()) : dotGit;
    const common = existsSync(join(gitDir, 'commondir')) ? resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()) : gitDir;
    const loose = join(common, 'refs', 'heads', ...branch.split('/'));
    if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
    const packed = existsSync(join(common, 'packed-refs')) ? readFileSync(join(common, 'packed-refs'), 'utf8').split(/\r?\n/).find((l) => l.endsWith(` refs/heads/${branch}`)) : null;
    return packed ? packed.split(' ')[0] : null;
  } catch {
    return tryGit(cwd, 'rev-parse', '-q', '--verify', `refs/heads/${branch}^{commit}`);
  }
}
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
