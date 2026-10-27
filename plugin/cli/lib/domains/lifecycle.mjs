// The bolt and intent lifecycles as data: `state.machines` lists each machine's states as an ordered list of
// `{ state, when }` rules, the first whose guards all hold naming the state, and its transitions as
// `{ from, to, on, when }`. A guard is a named predicate over a doc's facts; data names and orders them, code holds
// them (docs/design/lifecycle.md).
import { config, list } from '../foundation/data.mjs';

const ST = config.state.names, VERDICT = config.state.verdicts;

// Facts computed on first use and kept: a guard reads only what it needs, so a merged bolt reads no review.
export function lazy(getters) {
  const out = {};
  for (const [k, get] of Object.entries(getters)) {
    Object.defineProperty(out, k, { configurable: true, enumerable: true, get: () => { const v = get(); Object.defineProperty(out, k, { value: v, enumerable: true }); return v; } });
  }
  return out;
}

// A record that failed on the current base, and one the base has moved past.
const failedOn = (rec, base) => Boolean(rec) && !rec.ok && rec.base === base;
const smokeDown = (d) => Boolean(d.smoke) && !d.smoke.ok && !(d.rollback?.ok && d.rollback.at > d.smoke.at);

export const GUARDS = {
  bolt: {
    merged: (f) => f.merged,
    unapproved: (f) => f.unapproved,
    approvalDraft: (f) => f.approval === ST.draft,
    approvalStale: (f) => f.approval === ST.stale,
    stoppedAfterApproval: (f) => f.stopped,
    dependencyPending: (f) => f.dependencyPending,
    onBranch: (f) => f.onBranch,
    escalated: (f) => f.verdicts.has(VERDICT.escalate),
    builderAtWork: (f) => f.verdicts.atWork,
    fixVerdict: (f) => f.verdicts.has(VERDICT.fix),
    fixRelaunched: (f) => f.relaunched(f.verdicts.fixAt),
    readyToMerge: (f) => !f.verdicts.focus && (!f.verdicts.quick || Boolean(f.report)),
    gateRelaunched: (f) => Boolean(f.gate?.at) && f.relaunched(Date.parse(f.gate.at)),
    gateCurrent: (f) => f.gateCurrent,
    reviewerAtWork: (f) => f.reviewerFresh,
    reported: (f) => f.verdicts.reported,
    builderFresh: (f) => f.fresh,
  },
  intent: {
    released: (f) => f.released,
    complete: (f) => f.complete,
    approvalDraft: (f) => f.approval === ST.draft,
    approvalStale: (f) => f.approval === ST.stale,
    incrementDue: (f) => f.incrementDue,
    held: (f) => Boolean(f.hold) && !smokeDown(f.deploy),
    checkFailed: (f) => f.checkSet && failedOn(f.deploy.check, f.base),
    checkPassed: (f) => !f.checkSet || (f.deploy.check?.base === f.base && f.deploy.check.ok),
    releaseFailed: (f) => failedOn(f.deploy.release, f.base),
    smokeFailed: (f) => smokeDown(f.deploy),
    rolledBack: (f) => Boolean(f.deploy.smoke) && !f.deploy.smoke.ok && !smokeDown(f.deploy),
    baseMoved: (f) => [f.deploy.check, f.deploy.release, f.deploy.smoke].some((r) => r && !r.ok && r.base !== f.base),
  },
};

// The state a machine's rules give a doc's facts: the first rule whose guards all hold.
export function stateOf(machine, facts) {
  const guards = GUARDS[machine];
  return config.state.machines[machine].derive.find((r) => list(r.when).every((g) => guards[g](facts))).state;
}
