---
type: Design
title: Approvals
description: How the owner approves intents, requirements, units and decisions, what makes an approval stale, what the lead may approve for them, and how owner prompts are recorded.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T20:10:00Z }
---

# Stamp
- Approval uses OKF's own trust field. `aidlc approve` takes one or more docs (IDs or paths). It keeps earlier `verified` events, appends `{ by: human:<git user.email>, at }`, sets `status: stable`, and writes `verified_hash`: sha256 of the body plus the parsed frontmatter as sorted JSON, without `verified`, `verified_hash`, `status`, `hold`, `priority` and `board` ([Board](board.md)). So YAML formatting, a hold or a board field never stales a doc. A quick-lane fix unit needs no approval.
- Editing an approved doc makes it `stale`; `next` then asks for re-approval ([State](state.md#next)).
- A unit's approval covers the decisions it links to: when `next` asks to approve or re-approve units, it adds every draft Decision doc their bodies link to.
- A unit at a one-way door needs a decision: its scope overlaps a `decisions.paths` glob (default `lanes.full`) or an interface doc listed under its `Interfaces`. Unless the unit links a Decision doc or says `twoWay: "<why it is easy to undo>"` in its frontmatter, plan lint reports `PLAN-DECISION` and `approve` refuses it. Focus globs alone are no door: they get a deeper review, not a decision. The owner asked for this after the M3 and M4 pilots wrote none (2026-10-23).

# Who approves
- Agents cannot approve: the guard denies `aidlc approve` from a tool call, and the scope hook denies any edit to `verified` or `verified_hash`. Only the owner approves: by typing `approve <doc>…` as a prompt ([0011](../decisions/0011-plain-word-approval.md)), by answering the prompt the guard raises when the lead runs `aidlc approve` ([0009](../decisions/0009-approval-prompt.md)), by `!` in a terminal, or through a class they delegated ([0008](../decisions/0008-delegated-approvals.md)). Every owner step `next` names gives both the command and the words to type.
- A delegated `reapprove` refuses an edit that changes a unit's acceptance criteria: the CLI finds the approved version in git history (the commit whose content matches `verified_hash`) and compares the AC lines; without that version it refuses too, and `next` then names the owner's approval instead.
- Auto mode's classifier may refuse the lead's `approve --auto` as self-approval, as it did twice in the [M2 pilot](../pilot/m2-interventions.md). The denied hook records it, and `next` then names `aidlc approve <docs>`, which reaches the owner as a permission prompt. The plugin writes no permission rules (owner's choice, 2026-10-23).

# Owner prompts
- When the guard raises a permission prompt for an owner command, it records the command and the tool call in `.git/aidlc/prompts.json` (the last five). The PostToolUse hook marks it `ran` when that call completes, which happens only after the owner said yes.
- `status` shows the last prompt and whether it ran, so after a clear or on another device the lead can tell an answered prompt from a pending one. A stamp whose prompt ran is the owner's: the lead never reverts it.
