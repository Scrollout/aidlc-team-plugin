---
type: Design
title: Lifecycle as data
description: The bolt and intent lifecycles as declarative state machines in cli.json, transitions fired by commands and guarded by named predicates, the next action chosen from an ordered list in data, and the merge gate and the review as ordered stages a project can extend but not shorten.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T17:20:52Z }
---

# Why
The transitions in `cli.json` only draw the diagrams. The states and the next action come from a hand-ordered chain of checks in code, so the drawn workflow and the enforced one can drift, and a project cannot add a step without a release.

# The machines
- `state.machines.bolt` and `state.machines.intent` list each transition as an object, `{ "from", "to", "on", "when", "why" }`, and `derive`, the ordered rules `{ "state", "when" }` that give a doc its state: the first whose guards all hold, the last holding always.
- A guard reads a doc's facts, computed once from git and the bundle and only when a guard asks, so a merged bolt reads no review.
- `on` names the command that fires the transition (`start`, `report`, `review`, `merge`), the same command `next` names ([Values as data](values.md)).
- `when` names a guard, such as `dependencyPending`, `readyToMerge` or `checkPassed`. A guard is a small predicate in code, with its own test. Data names and orders guards; it never holds an expression.

# The next action
`next.order` is an ordered list of `{ "when", "action" }`, the last holding always. `next` serves the first entry whose guards all hold: its action builds the line from its message, and serves the `aidlc` command it names as `{ "command", "args" }` ([State](state.md#next)). The context its guards read is computed only as far as an entry asks.

# Pipelines
A project extends the gate and the review; it never shortens them.
- **Merge gate:** `gate.stages` lists the gate's stages in order, each a check in code: approval, scope, the added lines, the lane, the reviews, the trial merge, the AC tests, the level runs, proof-revert, the checks, architecture, the docs and the extensions' checks. A conflict at the trial merge ends the walk. An entry of `profile.checks` given as `{ "id", "check", "level", "after" }` is a stage of its own: its `check` command runs on the merged tree after the stage `after` names, the trial merge or one after it (default `checks`), and fails as `GATE-CHECK` at its `level`, `error` (default) refusing the merge, `warning` reported with it. A string entry runs in the `checks` stage. A core stage always refuses: an entry reusing its id, naming another `after` or another level is `PROFILE-STAGE`.
- **Review focuses:** `general` always runs; each `profile.focus` entry whose globs the diff touches, and `security` on a line matching `security.content`, adds its focus ([Review rounds](review-rounds.md)). A profile adds focuses and cannot drop `general`.
- **Hooks:** no chain in data. The host owns its hook registration and holds each hook to its time budget ([Hooks](hooks.md)), so a project adds a hook in its own host settings.

# What stays in code
The guards, the interpreter that walks the machines and lists, and the facts derived from git and the bundle ([State](state.md)). The diagrams are drawn from the same data.

Bolts: [M26](../roadmap/m26.md) B240.
