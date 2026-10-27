---
type: Design
title: Grid
description: The AI-DLC rows, the plan-execute-validate loop in each cell, lanes and the doc types each row produces.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T06:40:00Z }
---

# Rows
The workflow, drawn from the pathways and state transitions: [Workflow](diagrams/workflow.md).

| Row | Output | Deterministic check | Owner approves |
|---|---|---|---|
| Intent | `intents/I-<n>-<slug>.md`: goal, why, increments, risks, success measures, out of scope | required sections | yes |
| Bolts | `bolts/B-<n>-<slug>.md`: why, ACs (`AC-<k>`), cited requirements (NFRs among them), `depends`, `modules`, `scope`, `reserves` | DAG acyclic, AC IDs unique, scopes of parallel bolts disjoint, reservations unique, size | the plan, once |
| Domain | `# Domain` in the bolt doc: entities, their one owning domain, interactions; no technology | `PLAN-DESIGN` in the full lane ([Design rows](design-rows.md)) | with the plan |
| Logical | `# Logical` in the bolt doc + decision docs | `PLAN-DESIGN` in standard and full; decision has options, choice, why | with the plan; one-way doors as decisions |
| Source | code + tests tagged `B-<n>/AC-<k>`, written first | every AC tagged by a test at its declared level; diff inside scope; module checks green; review verdict | no |
| Deployment | the package the profile's CI builds | profile `deploy.check` commands | no |
| Operation | release record or tag, runbook link | profile `deploy.run`, `release`, `deploy.smoke`; `deploy.rollback` on a failed smoke ([Intent states](intent-states.md)) | yes, by typing `release I-<n>` |

Paths are relative to the project's bundle (profile `docs.bundle`).

# Bolt doc
The ID comes from the file name, `bolts/B-<n>-<slug>.md`. Fields live in the frontmatter and ACs in the body:
```
---
type: Bolt
intent: I-2
depends: [B-3]
modules: [api]
scope: ["internal/pricing/**"]
reserves: [migration regional/0005]
---
- AC-1 (unit): price rounds half-even per currency.
```
Plan lint checks the plan before approval; its codes are in [Plan lint](plan-lint.md).

# Plan, execute, validate
Every cell runs the same loop:
1. **Plan:** the lead drafts and asks the owner clarifying questions, offering 2-3 options with trade-offs where a choice is real.
2. **Execute:** the lead (doc rows) or a builder (Source) produces the output.
3. **Validate:** the CLI check for the row, then the reviewer for Logical and Source.

The owner's checkpoint is the plan of an approval row, where a correction is cheapest.

# Lanes
| Lane | Rows run | Picked when |
|---|---|---|
| quick | Source (checks only, no reviewer) | every changed path matches `lanes.quick` (e.g. `docs/**`, `*.md`) |
| standard | Bolts, Logical (section), Source | default |
| full | all rows, plus specialist review | any path matches `lanes.full` or a specialist's globs (auth, migrations, contracts) |

The CLI computes the lane from the bolt's `scope` before work and from the diff at merge; the higher wins. The model may raise a lane, never lower it. An intent's `lane` is a floor: its bolts run at least in that lane ([Intake](intake.md#the-proposal)).

Globs: `**` spans folders, `*` and `?` stay inside one, and a pattern without `/` matches the file name at any depth unless it starts with `/`, as in `.gitignore`. Diff paths are anchored at the root. A scope or path is quick when it lies inside a `lanes.quick` glob, and full when it overlaps a `lanes.full` or `focus` glob (scope `internal/**` overlaps `internal/auth/**`). `lane` prints the lane and the glob or path that decided it.

# Tests
Tests are the Source row's second output, derived from the ACs written in Bolts, so they are planned before any code exists.
- Each AC declares a level, e.g. `AC-2 (integration): …`. `profile.levels` maps each level to `paths` globs and a `run` command; the plugin defaults define `unit`, `integration` and `e2e`. The gate checks that the tagged test lives where its level says.
- Behaviour that crosses a module or the network needs `integration` or higher; unit tests alone prove only local logic. Each intent has an AC at the top level ([Plan lint](plan-lint.md), `PLAN-INCREMENT`).
- A fix bolt always has one AC: a regression test that fails before the fix.
- Quick lane adds no tests and runs no level: the gate runs only the commands its ACs name ([Merge mechanics](gate.md#details)).

# Increments
An intent lists its increments under `# Increments`, the walking skeleton first; each ends to end and ships as soon as its bolts merge. The rules and the increment release: [Increments and bolts](increments-and-bolts.md).
