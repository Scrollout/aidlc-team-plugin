---
type: Decision
title: 0008 Delegated approvals
description: The owner can let the lead approve two classes of docs itself, re-approvals and quick-lane units, through an untracked personal setting; first approvals of intents, plans, requirements and one-way doors stay with the owner.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T12:41:16Z }
---

# Context
In the pilot most owner gates were re-approvals of a doc the lead had just edited to carry out an answer the owner gave a minute earlier. Each one costs the owner a `!` command and stops the loop.

# Options
1. Keep every approval a `!` command.
2. **Delegated classes in the owner's personal profile.**
3. One command approving everything pending: fewer prompts, same stops.
4. Full auto: no approval gates in the owner's sessions.

# Decision
Option 2, chosen by the owner on 2026-10-22.
- `.aidlc/local/profile.json` (untracked) may set `"approvals": { "auto": ["reapprove", "quick"] }`, written by the owner command `aidlc delegate reapprove quick` (`off` clears it). Only this file counts, so a commit cannot delegate for the owner.
- `reapprove`: a doc approved by a human before and edited since (`stale`). `quick`: a draft unit in the quick lane.
- When every doc a gate waits on is delegated, `next` prints an action instead of a gate: `aidlc approve --auto <docs>`. The CLI checks each doc's class and refuses the rest.
- The stamp is `{ by: agent:auto, at }`, so history shows who approved. An approval counts with a `human:` or `agent:` event.
- The guard still denies `aidlc approve` without `--auto`; the scope hook denies agent writes to the personal profile and to any `verified` entry.
- First approvals of intents, plans, requirements and one-way-door decisions are never delegated.

# Why
Principle 5 keeps the decisions with the owner; a re-approval of an edit that carries out an owner answer is bookkeeping, not a decision. A quick-lane unit touches only paths the owner has already declared low risk.
