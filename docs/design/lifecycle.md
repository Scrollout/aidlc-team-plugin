---
type: Design
title: Lifecycle as data
description: Draft - the bolt and intent lifecycles as declarative state machines in cli.json, transitions fired by commands and guarded by named predicates, the next action chosen from an ordered list in data, and the gate, review and hook pipelines as ordered stage lists a project can extend.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T17:20:52Z }
---

# Why
The transitions in `cli.json` only draw the diagrams. The states and the next action come from a hand-ordered chain of checks in code, so the drawn workflow and the enforced one can drift, and a project cannot add a step without a release.

# The machines
- `state.machines.bolt` and `state.machines.intent` list the states, and each transition as an object: `{ "from", "to", "on", "when" }`.
- `on` names the command that fires the transition (`start`, `report`, `review`, `merge`), the same method the `rpc` adapter serves ([Values as data](values.md)).
- `when` names a guard: `dependencyMerged`, `ciGreen`, `everyFocusPassed`. A guard is a small predicate in code, with its own test. Data names and orders guards; it never holds an expression.

# The next action
`next.order` is an ordered list of `{ "when", "action" }`. `next` serves the first entry whose guard holds as a JSON-RPC 2.0 request (`method`, `params`), and its text from the action's message.

# Pipelines
The merge gate's checks, the review focuses and the hook chain are ordered stage lists of `{ "id", "check", "level" }`. A project's profile may add a stage, whose check is a profile command, or set a stage's level; it cannot remove a stage the core requires.

# What stays in code
The guards, the interpreter that walks the machines and lists, and the facts derived from git and the bundle ([State](state.md)). The diagrams are drawn from the same data.

Bolts: [M26](../roadmap/m26.md) B240.
