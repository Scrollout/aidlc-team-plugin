---
type: Decision
title: 0008 Delegated approvals
description: The owner can let the lead approve two classes of docs itself, re-approvals and quick-lane bolts, through an untracked personal setting; first approvals of intents, plans, requirements and one-way doors stay with the owner.
status: accepted
decision-makers: the owner
date: 2026-10-22
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T12:41:16Z }
---

# Delegated approvals

## Context and Problem Statement
Most owner gates can be re-approvals of a doc the lead has just edited to carry out an answer the owner gave a minute earlier. Each one costs the owner a `!` command and stops the loop.

## Considered Options
1. Keep every approval a `!` command.
2. **Delegated classes in the owner's personal profile.**
3. One command approving everything pending: fewer prompts, same stops.
4. Full auto: no approval gates in the owner's sessions.

## Decision Outcome
Option 2.
- `.aidlc/local/profile.json` (untracked) may set `"approvals": { "auto": ["reapprove", "quick"] }`, written by the owner command `aidlc delegate reapprove quick` (`off` clears it). Only this file counts, so a commit cannot delegate for the owner.
- `reapprove`: a doc approved by a human before and edited since (`stale`). `quick`: a draft bolt in the quick lane.
- When every doc a gate waits on is delegated, `next` prints an action instead of a gate: `aidlc approve --auto <docs>`. The CLI checks each doc's class and refuses the rest.
- The stamp is `{ by: process:delegated, at }`, an OKF actor (§7) that marks it machine-confirmed, so history shows who approved. An approval counts with a `human:` or `process:` stamp, or an `agent:auto` one from before 0.14.
- The guard still denies `aidlc approve` without `--auto`; the scope hook denies agent writes to the personal profile and to any `verified` entry.
- First approvals of intents, plans, requirements and one-way-door decisions are never delegated.
- A `reapprove` does not cover an edit that changes a bolt's acceptance criteria: that changes what done means, so it goes back to the owner ([Approvals](../design/approvals.md#who-approves)).

Principle 5 keeps the decisions with the owner; a re-approval of an edit that carries out an owner answer is bookkeeping, not a decision. A quick-lane bolt touches only paths the owner has already declared low risk.
