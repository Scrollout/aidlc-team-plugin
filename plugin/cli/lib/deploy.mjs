// Deploy: the grid's Deployment and Operation rows, run from the profile's commands. Each step's last run is
// recorded with the base commit it ran on; `next` reads the record and never runs a step (docs/design/operations.md).
import { config, done, git, list, readJson, sh, tryGit, UsageError } from './config.mjs';
import { msg } from './template.mjs';
import { bump, ciGreen, readState, runtimeFile, writeJson } from './state.mjs';

// Runs the commands in order until one fails: { ok, command, exit, output }, with the tail of the output.
function runAll(cwd, commands) {
  let last = { ok: true };
  for (const command of commands) {
    const r = sh(cwd, command);
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
  if (!states.includes(intent.state) && !intent.incrementDue) throw new UsageError(msg('deployNotMerged', { intent: intent.id, state: intent.state }));
  const base = tryGit(cwd, 'rev-parse', st.base);
  if (tryGit(cwd, 'rev-parse', 'HEAD') !== base) throw new UsageError(msg('deployNotOnBase', { base: st.base }));
  return { st, intent, base, top: git(cwd, 'rev-parse', '--show-toplevel'), file: runtimeFile(cwd, 'deploys', intent.id) };
}

// Records one step's run and says how it went.
function record(t, step, result) {
  const at = new Date().toISOString();
  if (!result.ok) bump(t.top, config.retro.deployFailures, { intent: t.intent.id, step, command: result.command, at }); // the retro's feedback
  writeJson(t.file, { ...(readJson(t.file) ?? { intent: t.intent.id }), [step]: { ...result, base: t.base, at } });
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

  // The owner's step: deploy.run, then the profile's release, after a deploy check passed on this base.
  release([id, ...more], { cwd }) { // an owner step takes no flag, so `--auto` passes no guard (U70)
    const t = target(cwd, more.length ? null : id, 'releaseUsage');
    const { deploy = {}, release } = t.st.profile;
    const commands = [deploy.run, release].filter(Boolean);
    if (!commands.length) throw new UsageError(msg('releaseUsage', {}));
    if (list(deploy.check).length && !(t.intent.deploy.check?.ok && t.intent.deploy.check.base === t.base)) throw new UsageError(msg('releaseNoCheck', { intent: t.intent.id }));
    const ci = ciGreen(t.st.ci);
    if (ci !== true) throw new UsageError(msg('releaseCiNotGreen', { intent: t.intent.id, ci }));
    const result = runAll(t.top, commands);
    let out = record(t, 'release', result);
    const smoke = result.ok && deploy.smoke ? runAll(t.top, [deploy.smoke]) : result;
    if (result.ok && deploy.smoke) out += record(t, 'smoke', smoke);
    return done(out, smoke.ok ? config.exit.ok : config.exit.findings);
  },

  // The owner's step after a failed smoke; without deploy.rollback it records the owner's rollback by hand.
  rollback([id, ...more], { cwd }) {
    const t = target(cwd, more.length ? null : id, 'rollbackUsage', ['merged', 'released']);
    const result = runAll(t.top, list(t.st.profile.deploy?.rollback));
    return done(record(t, 'rollback', result), result.ok ? config.exit.ok : config.exit.findings);
  },
};
