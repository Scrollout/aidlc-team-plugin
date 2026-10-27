---
type: Decision
title: 0002 Worktree subagents
description: Parallel workers are worktree-isolated subagents of one lead session, not peer sessions.
status: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Worktree subagents

## Considered Options
1. Peer sessions coordinated by an operator session (a previous tool). Each session pays full context; coordination needs messages, handoffs and rules about who may push.
2. **Worktree subagents.** One session, fresh small contexts per unit, results returned to the lead.

## Decision Outcome
Option 2, chosen by the owner on 2026-10-22.

Cheaper (no duplicated session context), one place where hooks and the gate apply, and no handoff protocol to drift. Cost: a very long intent may outgrow one lead session; derived state ([0001](0001-derived-state.md)) lets a new session resume with `aidlc status`.
