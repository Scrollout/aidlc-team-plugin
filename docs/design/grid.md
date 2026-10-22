---
type: Design
title: Grid
description: The AI-DLC rows, the plan-execute-validate loop in each cell, lanes and the doc types each row produces.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** Every piece of work moves down the grid. Each row's output is an OKF doc that becomes the next row's input; the lane, computed from paths, decides which rows run.

## Rows
| Row | Output | Deterministic check | Owner approves |
|---|---|---|---|
| Intent | `intents/I-<n>-<slug>.md`: goal, why, success measures, out of scope | required sections | yes |
| Units | `units/U-<n>-<slug>.md`: stories, ACs (`AC-<k>`), NFRs, risks, `depends`, `modules`, `scope`, `reserves` | DAG acyclic, AC IDs unique, scopes of parallel units disjoint, reservations unique, size | the plan, once |
| Domain | `design/U-<n>-domain.md`: entities, aggregates, context map; no technology | required sections | no |
| Logical | `## Logical` in the unit doc, or `design/U-<n>-logical.md` + decision docs | decision has options, choice, why; contract and migration checks | one-way doors only |
| Source | code + tests tagged `U-<n>/AC-<k>`, written first | every AC tagged by a test at its declared level; diff inside scope; module checks green; proof-revert (full lane); review verdict | no |
| Deployment | the package the profile's CI builds | profile `deploy.check` commands | no |
| Operation | release tag, runbook link | profile `release` command, smoke | yes |

Paths are relative to the project's bundle (profile `docs.bundle`).

## Plan, execute, validate
Every cell runs the same loop:
1. **Plan:** the lead drafts and asks the owner clarifying questions, offering 2-3 options with trade-offs where a choice is real.
2. **Execute:** the lead (doc rows) or a builder (Source) produces the output.
3. **Validate:** the CLI check for the row, then the reviewer for Logical and Source.

The owner's checkpoint is the plan of an approval row, where a correction is cheapest.

## Lanes
| Lane | Rows run | Picked when |
|---|---|---|
| quick | Source (checks only, no reviewer) | every changed path matches `lanes.quick` (e.g. `docs/**`, `*.md`) |
| standard | Units, Logical (section), Source | default |
| full | all rows, plus specialist review | any path matches `lanes.full` or a specialist's globs (auth, migrations, contracts) |

The CLI computes the lane from the unit's `scope` before work and from the diff at merge; the higher wins. The model may raise a lane, never lower it.

## Tests
Tests are the Source row's second output, derived from the ACs written in Units, so they are planned before any code exists.
- Each AC declares a level: `unit`, `integration` or `e2e`, e.g. `AC-2 (integration): …`. The profile maps each level to path globs and a command; the gate checks that the tagged test lives where its level says.
- Behaviour that crosses a module or the network needs `integration` or higher; unit tests alone prove only local logic.
- A fix unit always has one AC: a regression test that fails before the fix.
- Quick lane adds no tests but runs the existing ones.

## Vertical and horizontal specs
- `capabilities/`: one doc per user journey (vertical); written in Units.
- `architecture/`: one doc per layer or module (horizontal); updated in Logical.
- Units link to both rather than copying them.
