---
type: Design
title: State
description: How the CLI derives progress from git and docs, how approvals work, and how next picks the one allowed step.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T22:00:00Z }
---

# Sources of truth
| Fact | Where it comes from |
|---|---|
| Intent and plan approved | a `human:` entry in the doc's OKF `verified` field, with `verified_hash` still matching the content |
| Bolt exists, its deps, scope | the bolt doc |
| Bolt in progress | branch `bolt/B-<n>` exists |
| Bolt reviewed | `.git/aidlc/reviews/B-<n>.json`, by diff hash: a `pass` in `general` and each focus the gate needs |
| Bolt done | a merge commit on the base branch with trailer `Unit: B-<n>` |
| Released | every bolt merged, every increment line naming bolts, and a release holding each merge: a tag, a passed `aidlc release` (and smoke), or test-only scopes |

`.git/aidlc/` sits in git's common dir: every worktree sees it; it is never committed.

# Bolt states
The states and what moves a bolt between them: [Bolt states](diagrams/bolt-states.md), drawn from `state.machines.bolt`.
A quick-lane bolt without an intent starts `approved`; its report makes it `reviewed`, with no review. Intents: [Intent states](intent-states.md).

# Approvals
Intents, requirements, bolts and one-way-door decisions carry the owner's approval; an edit stales it ([Approvals](approvals.md)).

# next
`aidlc next` prints one line: the next action and the command or agent for it. Badges (`state.badges`): 👉 an owner step, ⛔ a refusal or stop. It exits 2 when the owner acts. Its answer's `data` also serves the action as `{ command, args }`, the `aidlc` command the line names, from `state.actions` (null for an agent's or the owner's own step). Order:
1. A merge cut off → continue it. A failed release or smoke → ⛔ the owner retries or rolls back, then a fix bolt ([Deployment and Operation](operations.md#details)). A red base CI → a fix bolt; only fix bolts build or merge ([CI on the base](base-ci.md)). Any doc held with `research: <question>` unanswered in `research/` → research it (`aidlc research <doc>`), or wait for its researcher ([0010](../decisions/0010-research-for-open-questions.md)); the digest ends that hold. A built bolt's merge, fix round or review (`next.finish`) comes before the lead's own plan work (`next.finishBefore`: drafting bolts, an intent review, finishing a decision), so finished work never waits behind drafting; elaborating with the owner still comes first.
2. Any `stale` approval, decisions included → re-approve, with the drafts the stale docs cite.
3. A draft intent, requirement or bolt with open points (a template `<…>` placeholder outside plan fields, an `Open questions` item) → finish elaborating it with the owner, naming them; no approval or bolt work first. A draft intent that links no decision is also asked to draft the decisions it needs while the owner answers.
4. No intent yet: elaborate one; in an adopted project with none, the migration intent ([Everyday paths](paths.md#adopting-an-existing-project)). Intent not approved → ask for approval, with the draft requirements it cites.
5. Plan not approved → first the draft decisions the intent links: finish those with open points, then ask for their approval; an architecture choice shapes the cut. Then draft bolts, ask for approval with the draft decisions and requirements they cite.
6. Reviewed bolts → merge in DAG order, once each AC has a tagged test on the branch (else back to the builder). One the gate refused → ⛔ the owner, until the base or the diff changes.
7. Verdict `escalate` in any focus → the owner decides; their re-approval marks its findings answered on the card and sends the bolt straight to review.
8. A builder that reported `stopped` → the lead fixes the spec (re-approved) or the cause; the builder restarts, and is building from then on. Verdict `fix` → fix round, findings on the card, none while its builder runs. A verdict older than the builder's last report no longer counts.
9. Reported, not reviewed → review, one reviewer per required focus without a `pass` for the current diff, in parallel ([Skill and agents](prompts.md#review)).
10. Building with a stale heartbeat ([Agents in flight](in-flight.md)) and no report → restart its builder. A merged bolt still in a worktree → stop its builder, remove it.
11. Approved, unblocked bolts → build, on one line; up to `parallel.max` in flight, with scopes disjoint from every bolt started and not merged, intent bolts before fix bolts at the same priority; with `ci.wait`, the base pushed first and `ci wait` run beside them.
12. Builders running → wait. An increment line naming no bolt once the intent's bolts merged → cut them ([Increments](increments-and-bolts.md)).
13. Intent merged, not released → its release steps: a hold, the deploy check, a fix bolt, the release ([Deployment and Operation](operations.md#details)). 4–12 serve the next intent meanwhile. All released → the owner clears the lead's session first ([Resume](resume.md#between-intents)).

A gated, escalated or stopped bolt holds back no other bolt's review, fix or restart. An owner gate in steps 2–5 holds back only the bolts that wait on its docs: `next` first returns an action of steps 6–11 for the other bolts, then the gate. A held bolt gets none until released. An action auto mode refused at this commit goes to the owner: `aidlc approve <docs>` for a delegated approval, else the refused command ([Hook checks](hook-checks.md)).

`aidlc status` prints it as a table; SessionStart injects it (≤ 1,000 chars).

# Surviving a clear, crash or new session
All that matters is on disk before a turn ends: [Resume](resume.md).
