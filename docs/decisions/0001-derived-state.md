---
type: Decision
title: 0001 Derived state
description: Progress is computed from git and the docs bundle; there is no ledger, event log or handoff file.
status: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Derived state

## Context and Problem Statement
State the model must remember to record drifts: a call it skips goes unaudited, a ledger grows without bound, and a handoff file turns into an append-only pile. The reference AI-DLC workflows keep `aidlc-state.md` and `audit.md` updated by the model.

## Considered Options
1. Model-maintained state file (the reference workflows). Simple, but drifts whenever the model forgets.
2. Event ledger audited later. Detects drift only after the fact; grows without bound.
3. **Derive from git and docs.** Approvals in frontmatter, progress from branches and merge trailers.

## Decision Outcome
Option 3.

Nothing can drift because nothing is recorded separately; resuming on another machine needs only a clone. Cost: the CLI re-reads git each call, which is milliseconds at this scale.

## More Information
Revisit when:
`status` takes over 500 ms on a real project.
