---
type: Decision
title: 0002 Worktree subagents
description: Parallel workers are worktree-isolated subagents of one lead session, not peer sessions.
status: accepted
date: 2026-10-22
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Worktree subagents

## Context and Problem Statement
Bolts are built and reviewed in parallel. Each worker needs its own checkout and a small context, and the hooks and the merge gate must apply to all of them. How do parallel workers run?

## Decision Drivers
* No session context paid twice.
* One place where the hooks and the gate apply.
* No handoff protocol to drift.

## Considered Options
* Peer sessions coordinated by an operator session.
* **Worktree subagents of one lead session.**

## Decision Outcome
Chosen option: "Worktree subagents of one lead session", because each bolt gets a fresh small context in its own worktree, results return to the lead, and peer sessions would each pay a full context and need messages, handoffs and rules on who may push.

### Consequences
* Good, because the hooks and the gate apply in one session.
* Bad, because a very long intent may outgrow one lead session; derived state ([0001](0001-derived-state.md)) lets a new session resume with `aidlc status`.
