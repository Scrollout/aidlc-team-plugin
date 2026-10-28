// M26 B240: the bolt and intent lifecycles as data, each guard a named predicate over a doc's facts
// (docs/design/lifecycle.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../plugin/cli/lib/index.mjs';
import { GUARDS, lazy, stateOf } from '../plugin/cli/lib/domains/lifecycle.mjs';

const M = config.state.machines, ST = config.state.names, V = config.state.verdicts;
const commands = new Set(config.commands.map((c) => c.name));

test('B240/AC-1 each machine is data: derive rules and { from, to, on, when } transitions naming known states, commands and guards', () => {
  for (const [name, m] of Object.entries(M)) {
    const named = new Set([...m.derive.flatMap((r) => r.when), ...m.transitions.map((t) => t.when).filter(Boolean)]);
    assert.deepEqual([...named].filter((g) => !GUARDS[name][g]), [], `${name}: every guard the data names is in code`);
    assert.deepEqual(Object.keys(GUARDS[name]).filter((g) => !named.has(g)), [], `${name}: every guard in code is named by the data`);
    for (const t of m.transitions) {
      assert.deepEqual(Object.keys(t).sort(), ['from', 'on', 'to', 'when', 'why'], `${name}: ${t.from} -> ${t.to}`);
      assert.ok(t.on === null || commands.has(t.on), `${name}: ${t.on} is a command`);
      for (const s of [t.from, t.to]) assert.ok(s in ST, `${name}: ${s} is a state name`);
    }
    assert.deepEqual(m.derive.at(-1).when, [], `${name}: the last rule always holds, so every doc gets a state`);
  }
});

// A bolt's facts, as flow computes them, with only what a case needs.
const bolt = (facts = {}) => ({ merged: false, unapproved: false, approval: ST.approved, stopped: false, dependencyPending: false, onBranch: false, fresh: false, report: null,
  relaunched: () => false, gate: null, gateCurrent: false, reviewerFresh: false, ...facts,
  verdicts: { has: () => false, atWork: false, fixAt: 0, focus: null, quick: false, reported: false, ...facts.verdicts } });
const has = (...vs) => (v) => vs.includes(v);

test('B240/AC-1 each bolt guard holds on its facts, and the rules give the states status derives', () => {
  const cases = [
    [{ merged: true }, ST.merged], [{ unapproved: true, approval: ST.draft }, ST.draft], [{ unapproved: true, approval: ST.stale }, ST.stale],
    [{ stopped: true }, ST.stopped], [{ dependencyPending: true }, ST.blocked], [{ fresh: true }, ST.building], [{}, ST.approved],
    [{ onBranch: true, verdicts: { has: has(V.escalate) } }, ST.escalated], [{ onBranch: true, verdicts: { atWork: true } }, ST.building],
    [{ onBranch: true, verdicts: { has: has(V.fix), fixAt: 5 }, relaunched: (at) => at === 5 }, ST.building], [{ onBranch: true, verdicts: { has: has(V.fix) } }, ST.fix],
    [{ onBranch: true, gate: { at: '2026-10-28T00:00:00Z' }, relaunched: () => true }, ST.building], [{ onBranch: true, gateCurrent: true }, ST.gated], [{ onBranch: true }, ST.reviewed],
    [{ onBranch: true, verdicts: { focus: 'general', reported: true }, reviewerFresh: true }, ST.reviewing], [{ onBranch: true, verdicts: { focus: 'general', reported: true } }, ST.reported],
    [{ onBranch: true, verdicts: { focus: 'general' } }, ST.building], [{ onBranch: true, verdicts: { quick: true } }, ST.building],
  ];
  for (const [facts, want] of cases) assert.equal(stateOf('bolt', bolt(facts)), want, JSON.stringify(facts));
  assert.ok(GUARDS.bolt.readyToMerge(bolt({ verdicts: { quick: true }, report: {} })), 'a quick-lane bolt with a report is ready');
});

test('B240/AC-1 each intent guard holds on its facts, release steps included', () => {
  const intent = (facts) => ({ released: false, complete: false, approval: ST.approved, incrementDue: false, hold: null, base: 'b2', checkSet: true, deploy: {}, ...facts });
  for (const [facts, want] of [[{ released: true, complete: true }, ST.released], [{ complete: true }, ST.merged], [{ approval: ST.draft }, ST.draft], [{ approval: ST.stale }, ST.stale], [{}, ST.approved]]) {
    assert.equal(stateOf('intent', intent(facts)), want, JSON.stringify(facts));
  }
  const G = GUARDS.intent, failed = { ok: false, base: 'b2', at: 1 };
  assert.ok(G.incrementDue(intent({ incrementDue: true })));
  assert.ok(G.held(intent({ hold: true })) && !G.held(intent({ hold: true, deploy: { smoke: failed } })), 'a failed smoke stops even a held intent');
  assert.ok(G.checkFailed(intent({ deploy: { check: failed } })) && !G.checkFailed(intent({ checkSet: false, deploy: { check: failed } })));
  assert.ok(G.checkPassed(intent({ deploy: { check: { ok: true, base: 'b2' } } })) && G.checkPassed(intent({ checkSet: false })) && !G.checkPassed(intent({ deploy: { check: { ok: true, base: 'b1' } } })));
  assert.ok(G.releaseFailed(intent({ deploy: { release: failed } })) && !G.releaseFailed(intent({ deploy: { release: { ...failed, base: 'b1' } } })));
  assert.ok(G.smokeFailed(intent({ deploy: { smoke: failed } })) && G.rolledBack(intent({ deploy: { smoke: failed, rollback: { ok: true, at: 2 } } })));
  assert.ok(G.baseMoved(intent({ deploy: { check: { ...failed, base: 'b1' } } })) && !G.baseMoved(intent({ deploy: { check: failed } })), 'a fix merged moves the base past the failure');
  assert.ok(G.released(intent({ released: true })) && G.complete(intent({ complete: true })) && G.approvalDraft(intent({ approval: ST.draft })) && G.approvalStale(intent({ approval: ST.stale })));
});

test('B240/AC-1 facts are computed on first use and kept', () => {
  let calls = 0;
  const f = lazy({ costly: () => ++calls });
  assert.equal(calls, 0);
  assert.equal(f.costly + f.costly, 2);
  assert.equal(calls, 1);
});

test('B240/AC-2 next walks next.order: each entry names guards and an action the code holds, and the last always holds', async () => {
  const { ACTIONS, NEXT } = await import('../plugin/cli/lib/domains/flow.mjs');
  const order = config.next.order;
  assert.deepEqual(order.flatMap((e) => e.when).filter((g) => !NEXT[g]), [], 'every guard is in code');
  assert.deepEqual(order.map((e) => e.action).filter((a) => !ACTIONS[a]), [], 'every action is in code');
  assert.deepEqual(Object.keys(NEXT).filter((g) => !order.some((e) => e.when.includes(g))), [], 'every guard in code is ordered by the data');
  assert.deepEqual(Object.keys(ACTIONS).filter((a) => !order.some((e) => e.action === a)), [], 'every action in code is ordered by the data');
  assert.deepEqual(order.at(-1).when, [], 'the last entry always holds, so next always serves an action');
  assert.equal(order[0].action, 'continueMerge', 'a merge in progress comes first');
});

test('B240/AC-2 the gate walks gate.stages: each a stage in code, and a profile adds stages it cannot use to shorten the gate', async () => {
  const { STAGES, stagesOf } = await import('../plugin/cli/lib/domains/gate.mjs');
  const { stageProblem } = await import('../plugin/cli/lib/foundation/profile.mjs');
  const G = config.gate, L = config.okf.level;
  assert.deepEqual(G.stages.filter((id) => !STAGES[id]), [], 'every stage is in code');
  assert.deepEqual(Object.keys(STAGES), G.stages, 'every stage in code is ordered by the data, in its order');
  assert.ok(G.stages.includes(G.treeFrom) && G.stages.indexOf(G.stageAfter) > G.stages.indexOf(G.treeFrom));
  const own = { id: 'contract', check: 'make contract' };
  assert.equal(stageProblem(own), null);
  assert.equal(stageProblem({ ...own, level: L.warning }), null);
  assert.equal(stageProblem({ ...own, id: G.stages[0] }), 'stageCore', 'a core stage cannot be replaced');
  assert.equal(stageProblem({ ...own, after: G.stages[0] }), 'stageAfter', 'a command runs on the merged tree');
  assert.equal(stageProblem({ ...own, level: L.off }), 'stageLevel', 'a stage cannot be turned off');
  assert.equal(stageProblem({ id: 'x' }), 'stageShape');
  const walk = stagesOf({ checks: ['make lint', { ...own, after: G.treeFrom }, { ...own, id: G.stages[0] }] });
  assert.equal(walk.length, G.stages.length + 1, 'a string runs in the checks stage, a valid object adds a stage, an invalid one none');
  assert.equal(walk[G.stages.indexOf(G.treeFrom) + 1].name, '', 'the profile stage runs right after the stage it names');
  assert.deepEqual(walk.filter((s) => s.name).map((s) => s.name), G.stages, 'no core stage is dropped or moved');
});

test('B240/AC-2 a profile stage fails the merge at error and is reported at warning', async () => {
  const { codes, FAIL, merge, PROFILE, setup } = await import('./gate-repo.mjs');
  const stage = { id: 'contract', check: FAIL };
  const refused = merge(setup({ profile: { ...PROFILE, checks: [stage] } }));
  assert.equal(refused.code, 1);
  assert.ok(codes(refused).includes('GATE-CHECK'), refused.out);
  const warned = merge(setup({ profile: { ...PROFILE, checks: [{ ...stage, level: config.okf.level.warning }] } }));
  assert.equal(warned.code, 0, warned.out + warned.err);
  assert.match(warned.out + warned.err, /GATE-CHECK/);
  assert.match(warned.out, /^merged U-1 as /m);
});
