---
type: Decision
title: 0001 Derived state
description: Progress is computed from git and the docs bundle; there is no ledger, event log or handoff file.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Context
A previous tool relied on the model calling a ledger script; skipped calls went unaudited and the ledger reached 650 KB in a pilot project. Its handoff file grew into an append-only pile. AWS AI-DLC keeps `aidlc-state.md` and `audit.md` updated by the model.

# Options
1. Model-maintained state file (AWS). Simple, but drifts whenever the model forgets.
2. Event ledger audited later (a previous tool). Detects drift only after the fact; grows without bound.
3. **Derive from git and docs.** Approvals in frontmatter, progress from branches and merge trailers.

# Decision
Option 3.

# Why
Nothing can drift because nothing is recorded separately; resuming on another machine needs only a clone. Cost: the CLI re-reads git each call, which is milliseconds at this scale.

# Revisit when
`status` takes over 500 ms on a real project.
