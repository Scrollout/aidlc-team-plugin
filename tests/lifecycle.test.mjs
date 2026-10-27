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
