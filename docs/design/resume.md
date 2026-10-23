---
type: Design
title: Resume
description: How the lead survives a clear, a crash or a new session - what lives on disk instead of the conversation - and why the owner clears the lead between intents.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T22:00:00Z }
---

# What lives on disk
Nothing that matters lives only in the conversation; all below is on disk before the turn ends.
| Could be lost | Where it lives instead |
|---|---|
| Owner's answers during elaboration | the draft intent/unit doc: the lead writes each answer before asking the next question; open ones stay under `## Open questions` |
| Owner instructions about the plan ("hold U-4", "U-2 first") | plan fields set by `aidlc hold`, `aidlc priority` |
| Owner run mode (unattended, a stopping point, where to report) | `run` in the personal profile, set by the owner command `aidlc mode`; `status` shows it |
| Builder's work | WIP commits on `unit/U-<n>` after each passing test |
| Builder's report | `.git/aidlc/reports/U-<n>.json`, written by the builder's `aidlc report U-<n>` |
| Reviewer's verdict | the reviewer runs `aidlc review record` itself; the lead never relays it |
| Which builders are running | a heartbeat file per unit, touched by a hook in its worktree |
| A merge cut off midway | detected from `MERGE_HEAD`; `next` says abort or continue |

On resume (SessionStart `startup`, `resume`, `clear`, `compact`):
1. The hook injects `aidlc status` plus one line: load the `aidlc` skill and run `aidlc next`.
2. A unit with a fresh heartbeat is still running: wait, don't start a second builder.
3. A unit with a stale heartbeat and no report is interrupted: `next` restarts its builder from the same card, told to continue from the branch's last commit.
4. Reports and verdicts on disk count as if the old session had received them.

Result: after a clear, `next` returns the same action it would have returned before, with no duplicate builder and no lost work.

# Between intents
When every intent is released and nothing is in flight, `next` and `status` ask the owner to clear the lead's session (`/clear`) before the next intent. A finished intent's conversation costs tokens on every later turn: the lead's session was 94 % of a re-pilot's tokens in M2, and the owner cleared the pilot lead at 40 % after the third M4 pilot. The status hook brings back what the next intent needs, and `/clear` resumes passed in every pilot.
