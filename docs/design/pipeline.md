---
type: Design
title: Pipeline
description: The governance pipeline a unit passes through, in order - the checks before any work reaches a builder, and the checks after, each with its command, hook and codes.
status: stable
generated: { by: claude-code/claude-fable-5-1, at: 2026-10-26T11:30:00Z }
---

# Why one page
The checks are spread over the plan lint, the hooks, the gate and the deploy steps, each in its own doc. This page lists them in the order a unit meets them, so a lead reading a refusal, or an owner asking what stops bad work, sees the whole line. Every stage is deterministic: it reads docs, git and the profile, never the prose's meaning (owner, 2026-10-26).

# Before work reaches a builder
| # | Stage | Enforced by | Codes |
|---|---|---|---|
| 1 | Docs valid: OKF fields, links, size caps, stamps | docs hook on every bundle edit; `check` | `OKF-*`, `HOUSE-*` |
| 2 | Plan lint: DAG, scopes, slices, design rows, decisions, cards | `check`; `approve` refuses on errors | `PLAN-*` ([Plan lint](plan-lint.md)) |
| 3 | Approval: the owner's stamp, stale on any edit | prompt hook stamps typed approvals; delegated re-approvals only where delegated | ([Approvals](approvals.md)) |
| 4 | Card: rendered from the base commit, approved and not stale, ≤ 100 lines | `card` | `PLAN-CARD` ([Unit card](unit-card.md)) |
| 5 | Dispatch: deps merged, scopes disjoint, reservations free, `parallel.max`, base pushed with `ci.wait` | `next`, `start` | ([Parallel builders](parallel.md), [CI on the base](base-ci.md)) |
| 6 | Launch: the card's model, a unit named, an in-flight mark | model hook | `MODEL-*` |
| 7 | While building: writes inside scope, no secrets, no raw git on the base, owner commands only by prompt | scope, secrets and guard hooks | `SCOPE-*`, `GUARD-*` ([Hook checks](hook-checks.md)) |

# After the work
| # | Stage | Enforced by | Codes |
|---|---|---|---|
| 8 | Report: a JSON file, mutations for test-only work, sourced deps for new pins | `report` | ([Dependencies](dependencies.md)) |
| 9 | Reviews: one per required focus, three fix rounds then the owner, retry-safe | `review record` | ([Review rounds](review-rounds.md)) |
| 10 | Merge gate on a trial merge: scope, AC tests, levels, proof by revert or mutation, checks, OKF, security, architecture, data, names, deps, identity, card freshness | `merge` | `GATE-*`, `ARCH-*` ([Merge gate](gate.md)) |
| 11 | Base CI: push, wait; a red base builds and merges fix units only | `push`, `ci wait`, `check --ci` | `CI-*` ([CI on the base](base-ci.md)) |
| 12 | Ship, per merged slice: deploy check, the owner's release on a pushed green base, smoke, rollback | `deploy`, `release`, `rollback` | ([Operations](operations.md), [Slices](slices.md)) |
| 13 | Feedback: counters and the retro's proposals | `retro` | ([Steering](steering.md)) |

# Thresholds
`parallel.max` 3, card 100 lines, doc caps per type, `review.fixRounds` 3, `plan.sliceUnits` 3, `ci.wait` seconds, `heartbeatMs` for a quiet builder. Each sits in `cli.json` with the profile able to override the ones it names ([Profile](profile.md)).
