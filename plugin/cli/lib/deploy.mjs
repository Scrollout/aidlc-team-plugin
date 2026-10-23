// Deploy: the grid's Deployment and Operation rows, run from the profile's commands. Each step's last run is
// recorded with the base commit it ran on; `next` reads the record and never runs a step (docs/design/operations.md).
import { spawnSync } from 'node:child_process';
import { config, done, list, readJson, UsageError } from './config.mjs';
import { msg } from './template.mjs';
import { git, readState, runtimeFile, tryGit, writeJson } from './state.mjs';

// Runs the commands in order until one fails: { ok, command, exit, output }, with the tail of the output.
function runAll(cwd, commands) {
  let last = { ok: true };
  for (const command of commands) {
    const r = spawnSync(command, { cwd, shell: true, encoding: 'utf8' });
    last = { ok: r.status === 0, command, exit: r.status, output: (r.stdout + r.stderr).slice(-config.deploy.outputMax).trim() };
    if (!last.ok) break;
  }
  return last;
}

// The intent the args name, in one of `states`, on a work tree checked out at the base.
function target(cwd, id, usageKey, states = ['merged']) {
  const st = readState(cwd);
  const intent = st.intents.find((i) => i.id === id);
  if (!intent) throw new UsageError(msg(usageKey, {}));
  if (!states.includes(intent.state)) throw new UsageError(msg('deployNotMerged', { intent: intent.id, state: intent.state }));
  const base = tryGit(cwd, 'rev-parse', st.base);
  if (tryGit(cwd, 'rev-parse', 'HEAD') !== base) throw new UsageError(msg('deployNotOnBase', { base: st.base }));
  return { st, intent, base, top: git(cwd, 'rev-parse', '--show-toplevel'), file: runtimeFile(cwd, 'deploys', intent.id) };
}

// Records one step's run and says how it went.
function record(t, step, result) {
  writeJson(t.file, { ...(readJson(t.file) ?? { intent: t.intent.id }), [step]: { ...result, base: t.base, at: new Date().toISOString() } });
  return msg(result.ok ? 'deployPassed' : 'deployFailed', { intent: t.intent.id, step, ...result });
}

export const commands = {
  deploy([sub, id], { cwd }) {
    const t = sub === 'check' && id ? target(cwd, id, 'deployUsage') : null;
    const checks = list(t?.st.profile.deploy?.check);
    if (!checks.length) throw new UsageError(msg('deployUsage', {}));
    const result = runAll(t.top, checks);
    return done(record(t, 'check', result), result.ok ? config.exit.ok : config.exit.findings);
  },
};
