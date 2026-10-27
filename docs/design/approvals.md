---
type: Design
title: Approvals
description: How the owner approves intents, requirements, bolts and decisions, what makes an approval stale, what the lead may approve for them, and how owner prompts are recorded.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T22:20:00Z }
---

# Stamp
- Approval uses OKF's own trust field. `aidlc approve` takes one or more docs (IDs or paths). It keeps the other approvers' `verified` events, replaces its approver's own with `{ by: human:<git user.email>, at }` (git keeps the history; stamps that grew each round would make a doc near its cap need a trim, itself an edit, before every re-approval), sets `status: stable`, and writes `verified_hash`: sha256 of the body plus the parsed frontmatter as sorted JSON, without `verified`, `verified_hash`, `status`, `hold`, `priority` and `board` ([Board](board.md)). So YAML formatting, a hold or a board field never stales a doc. A quick-lane bolt without an intent, such as a quick fix, needs no approval.
- Editing an approved doc makes it `stale`; `next` then asks for re-approval ([State](state.md#next)). `next` names a decision by its number, or by its file name when another decision shares the number.
- A bolt's approval covers the decisions it links to: when `next` asks to approve or re-approve bolts, it adds every draft Decision doc their bodies link to.
- A bolt at a one-way door needs a decision: its scope overlaps a `decisions.paths` glob (default `lanes.full`) or an interface doc listed under its `Interfaces`. Unless the bolt links a Decision doc or says `twoWay: "<why it is easy to undo>"` in its frontmatter, plan lint reports `PLAN-DECISION`, naming the scope glob that reaches the door (a bare name such as `Makefile` matches at any depth: anchor it as `/Makefile`), and `approve` refuses it. Focus globs alone are no door: they get a deeper review, not a decision. Without the rule, a plan reaches a one-way door with no decision written.

# One-way doors and Inception
`approve` refuses two or more one-way-door decisions in one command (`APPROVE-BULK`), an intent or one-way door whose design review has an open confirmed finding (`APPROVE-OPEN`), and a doc carrying an Inception finding that blocks (`PATHWAY-SKIP`, `INTENT-SIZE`, `ELAB-OPEN`, `ELAB-BARE`, `FACT-MISSING`, `DOC-AMEND`, `DESIGN-COHERENCE`) ([Inception](inception.md#approval)).

# Who approves
- Agents cannot approve: the guard turns `aidlc approve` from a tool call into a permission prompt only the owner answers (a deny in `bypassPermissions` mode), and the scope hook denies any edit to `verified` or `verified_hash`. Only the owner approves: by typing `approve <doc>…` as a prompt ([0011](../decisions/0011-plain-word-approval.md)), by answering the prompt the guard raises when the lead runs `aidlc approve` ([0009](../decisions/0009-owner-commands-by-permission-prompt.md)), by `!` in a terminal, or through a class they delegated ([0008](../decisions/0008-delegated-approvals.md)). Every owner step `next` names gives both the command and the words to type. The words `release I-<n>` and `rollback I-<n>` give a go the guard uses up instead ([0012](../decisions/0012-typed-go-for-release-and-rollback.md), [Deployment and operation](operations.md#details)).
- A delegated `upgrade` lets the lead run the installed plugin's `upgrade` without a prompt; `--downgrade` and `--dirty` stay owner prompts ([0008](../decisions/0008-delegated-approvals.md)).
- `approve` refuses a doc its stamps would take over its size cap (`HOUSE-SIZE`, with the project's `docs.caps`), naming how much to trim, so an approved doc never fails the project's docs check: a doc just under its cap passes it once stamped. `check` warns the same `HOUSE-SIZE` on a draft or stale doc of an approvable type, counted with the next stamp by the git user, so the trim comes before the owner's prompt, not after a refused round. `approve` checks every doc it names before it writes any, and stamps a doc named twice once.
- A delegated `reapprove` refuses an edit that changes a bolt's acceptance criteria: the CLI finds the approved version in git history (the commit whose content matches `verified_hash`) and compares the AC lines; without that version it refuses too, and `next` then names the owner's approval instead.
- Auto mode's classifier may refuse the lead's `approve --auto` as self-approval ([Lessons](../lessons/lessons.md)). The denied hook records it, and `next` then names `aidlc approve <docs>`, which reaches the owner as a permission prompt. The plugin writes no permission rules: those stay the owner's.

# Owner prompts
- When the guard raises a permission prompt for an owner command, it records the command and the tool call in `.git/aidlc/prompts.json` (the last five). The PostToolUse hook marks it `ran` when that call completes, which happens only once the owner allowed it. When the CLI itself refuses an owner command (a pinned copy's `upgrade`, a bad argument), it marks the prompt `refused` first, so a call that still ends well, as one followed by `; echo $?` does, is not counted as run.
- `status` shows the last prompt and whether it ran, so after a clear or on another device the lead can tell an answered prompt from a pending one. A stamp whose prompt ran is the owner's: the lead never reverts it.
