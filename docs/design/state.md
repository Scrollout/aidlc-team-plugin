---
type: Design
title: State
description: How the CLI derives progress from git and docs, how approvals work, and how next picks the one allowed step.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** Nothing records progress. `aidlc next` recomputes it from the bundle, branches and merge trailers every time; only throwaway runtime data lives in `.git/aidlc/`.

## Sources of truth
| Fact | Where it comes from |
|---|---|
| Intent and plan approved | a `human:` entry in the doc's OKF `verified` field, with `verified_hash` still matching the content |
| Unit exists, its deps, scope | the unit doc |
| Unit in progress | branch `unit/U-<n>` exists |
| Unit reviewed | `.git/aidlc/reviews/U-<n>.json`, keyed by diff hash |
| Unit done | a merge commit on the base branch with trailer `Unit: U-<n>` |
| Released | a tag reachable from the base containing the intent's units |

`.git/aidlc/` sits in git's common dir, so every worktree sees the same runtime data, and it is never committed.

## Unit states
`draft → approved → building → reviewed → merged`, plus `blocked` (a dependency not merged) and `stale` (its approval no longer matches its content).

## Approvals
- Approval uses OKF's own trust field rather than an invented one. The owner runs `! aidlc approve <doc>`. It appends `{ by: human:<git user.email>, at }` to `verified`, sets `status: stable`, and writes the extension key `verified_hash`, covering the body and the frontmatter except `verified`, `verified_hash` and `status`.
- Agents cannot approve: the guard denies `aidlc approve` from a tool call, and the scope hook denies any edit that adds or changes a `human:` entry in `verified` or changes `verified_hash`. The `!` prefix runs outside the agent, so only the owner can.
- Editing an approved doc makes it `stale`; `next` then asks for re-approval. Only intents, plans (units) and one-way-door decisions carry approvals, so this stays rare.

## next
`aidlc next` prints one line: the single next action and the command or agent that performs it, e.g. `build U-3 (card: aidlc card U-3)`. Order:
1. Any `stale` approval → re-approve.
2. Intent not approved → elaborate and request approval.
3. Plan not approved → draft units and request approval.
4. Reviewed units → merge in DAG order.
5. Approved, unblocked units → build; up to `parallel.max` at once when scopes are disjoint.
6. All merged → deployment checks, then release.

`aidlc status` prints the same state as a short table; the SessionStart hook injects it, capped at 1,000 chars. This replaces handoff files.

## Surviving a clear, crash or new session
Rule: nothing that matters lives only in the conversation. Everything below is on disk before the turn that produced it ends.
| Could be lost | Where it lives instead |
|---|---|
| Owner's answers during elaboration | the draft intent/unit doc: the lead writes each answer before asking the next question; open ones stay under `## Open questions` |
| Owner instructions about the plan ("hold U-4", "U-2 first") | plan fields set by `aidlc hold`, `aidlc priority`, never chat memory |
| Builder's work | WIP commits on `unit/U-<n>` after every passing test; the worktree is on disk |
| Builder's report | `aidlc report U-<n>` writes `.git/aidlc/reports/U-<n>.json`; the builder runs it before returning |
| Reviewer's verdict | the reviewer runs `aidlc review record` itself; the lead never relays it |
| Which builders are running | a heartbeat file per unit, touched by a PostToolUse hook in its worktree |
| A merge cut off midway | detected from `MERGE_HEAD`; `next` says abort or continue |

On resume (SessionStart `startup`, `resume`, `clear`, `compact`):
1. The hook injects `aidlc status` plus one line: load the `aidlc` skill and run `aidlc next`.
2. A unit with a fresh heartbeat (under 2 min) is still running: wait, don't start a second builder.
3. A unit with a stale heartbeat and no report is interrupted: `next` restarts its builder from the same card, told to continue from the branch's last commit.
4. Reports and verdicts already on disk are picked up as if the old session had received them.

Result: after a clear, `next` returns the same action it would have returned before, with no duplicate builder and no lost work.
