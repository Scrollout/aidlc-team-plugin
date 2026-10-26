---
type: Design
title: Requirements and architecture checks
description: Lasting requirements as their own docs, and architecture rules as checks that fail a merge, so a project cannot drift from its intended shape.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T10:40:00Z }
---

# Why
Units and their ACs are short-lived. A project's lasting constraints are not: services that build on their own, control and data plane kept apart, the API as the only source of configuration. If those live only in prose, every unit can pass its own gate while the system slowly turns into something else, such as a monolith instead of a platform. Here they become docs the plan must cite, and rules the gate checks on every merge.

# Requirements
- `requirements/R-<n>-<slug>.md`, `type: Requirement`, with acceptance criteria like a unit. IDs compare by number, so `R-018` and `R-18` are the same.
- Intents and units cite them: `requirements: [R-4, R-18]`. Plan lint `PLAN-REQ`: an intent or unit that cites none, or cites one that does not exist. The rule applies once the bundle holds a requirement, so a project opts in by writing its first one.
- A requirement is approved like an intent; editing it makes it `stale`, and `next` asks for re-approval before any build. Draft requirements an intent or the current plan cites are asked for in the same approval as that intent or plan.
- `aidlc status` lists requirements that no merged unit cites yet.

# Architecture rules
The profile describes the intended shape; the plugin enforces it without knowing the language:
```json
"architecture": {
  "graph": "make deps-graph",
  "boundaries": [
    { "from": "internal/core/**", "deny": ["internal/providers/**"], "reason": "the core never depends on a provider" },
    { "from": "cmd/*/**", "deny": ["cmd/*/**"], "same": false, "reason": "each service builds on its own" }
  ],
  "checks": ["make contract-check"]
}
```
- `graph` prints one dependency edge per line, `<from path> -> <to path>`, repo-relative; a `graph` that exits non-zero is `ARCH-CHECK`. The project supplies it, e.g. from `go list -deps` or a bundler's module graph.
- A boundary denies edges from paths matching `from` to paths matching `deny`. With `"same": false`, an edge between two paths the same `*` matched differently is denied, so one service may not import another.
- Gate condition: no denied edge on the merged result (`ARCH-BOUNDARY`, naming the edge and the reason), and every `architecture.checks` command passes (`ARCH-CHECK`). Both run on every merge, whatever the unit touched, with the boundaries read from the merged tree, so the unit that adds a boundary is checked against it; `check --ci` runs them on the checked-out tree.
- Data edges, `<code path> -> <data node>`, are checked against each data node's owning module: [Data ownership](data-ownership.md) (`ARCH-DATA`). A module's public paths and circles between modules: [Module surfaces and cycles](module-surface.md) (`ARCH-API`, `ARCH-CYCLE`).
- An exception is a decision doc the owner approves, listed under the boundary as `except: ["docs/decisions/0009-….md"]`. It covers the edges it lists, one `<from> -> <to>` per line, so a baseline of known violations does not open the boundary to new ones; a decision listing no edge covers the whole boundary. A unit that adds a boundary lists the edges the base already has in its decision, or its own merge fails. The owner approves a decision on the base, so one the merge needs is a plan doc: the lead runs the graph, writes the decision on the base for the owner to approve, and the unit only names it under `except`. A unit that carries its own `except` decision is told so at merge (first migration: approval could not reach a doc that lived only on the unit branch).

# Review
Every review of a unit reads the requirements the unit cites and the interface docs it links (both are listed on its card) and checks the diff against them. The reference AI-DLC workflows work the same way: their code-generation reviewer always gets the shared contracts and the requirements. There is no separate `architecture` focus, because the boundaries and checks above already gate every merge ([Skill and agents](prompts.md#review)).
