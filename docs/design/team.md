---
type: Design
title: Team
description: The four roles, how parallel worktree workers are run and merged, and where tokens are spent.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** The owner decides; the lead runs the loop; builders write one unit each in their own worktree; a fresh reviewer checks each unit against its card. Specialists are the reviewer with a different focus.

## Roles
| Role | Who | Does | Never |
|---|---|---|---|
| Owner | the human | approves intent, plan, one-way doors, release; answers clarifying questions | reviews every line |
| Lead | main session + `aidlc` skill | runs `next`, writes intent/unit/design docs, starts builders and reviewers, merges | writes production code on the base branch |
| Builder | subagent, Sonnet, `isolation: worktree` | builds one unit from its card, test first; reports | edits outside scope, changes interfaces, approves |
| Reviewer | subagent, Opus, fresh context | checks the diff against the card and linked specs; returns findings | edits files |

The owner holds both leads of the AI-DLC diagram: product behaviour (Inception) and software system (Construction).

## Specialists
The reviewer prompt takes a `focus`: `general`, `security`, `data`, `ui`, or any focus a project defines. The profile maps globs to focuses (e.g. `internal/auth/**` → security) and, for security, content patterns too (e.g. `os/exec`, `crypto`, raw SQL, `password`), so a risky change outside the usual folders is still caught. A unit whose scope or diff matches gets one extra review per matching focus. These are the internal consultants of the AI-DLC team model, called on demand, never permanent.

Every general review also runs a short security baseline (input handling, authz on new entry points, secrets, injection, unsafe defaults); the dedicated security focus goes deeper and reads the project's threat model.

## Parallel work
- `aidlc next` lists buildable units: approved, deps merged, scopes disjoint from units in flight, up to `parallel.max` (default 3).
- The lead starts one builder per unit in a single message; each gets a fresh worktree on `unit/U-<n>` from the current base.
- The lead merges with `aidlc merge U-<n>` in DAG order. If the base moved, the gate merges the base into the unit branch and re-runs the checks before the `--no-ff` merge.
- A builder that hits a "stop and report" condition returns without code; the lead fixes the spec and restarts it.

## Model routing
The CLI picks the model; the lead passes it, and a PreToolUse hook on the Agent tool denies a builder or reviewer started with a different model than the card says.
| Work | Default | Escalates to Opus when |
|---|---|---|
| Domain, Logical rows (when delegated) | Opus | - |
| Source, quick lane | Sonnet | - |
| Source, standard lane | Sonnet | unit spans 2+ modules, has 6+ ACs, or matches a `complex` glob (concurrency, migrations, contracts) |
| Source, full lane | Opus | - |
| Fix round after a reviewer `fix` | same as round 1 | round 1 was Sonnet and a finding is CONFIRMED: round 2 runs on Opus |
| Review, specialists | Opus | - |

Thresholds and the table live in `profile.models`, so a project can shift the balance. The lead runs on the model the owner chose; the skill recommends Opus because the lead writes the design rows with the owner.

## Cost
- Builders default to Sonnet; Opus where the table above says so.
- Quick lane: no reviewer. Standard: one review. Full: one review plus specialists.
- Reviews are cached by diff hash; an unchanged diff is never reviewed twice.
- Each subagent loads only its card and linked docs; it never inherits the lead's conversation.
- Parallelism multiplies spend; `parallel.max` is a cost dial, not a speed setting.
