---
type: Report
title: Pilot interventions
description: Every manual step in the M1 pilot, by the owner or by the lead outside aidlc next, and the release that fixed it or the M2 item it became.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T16:21:38Z }
---

# Owner
- Typed `aidlc approve`, which is no shell command: messages show the runnable command (0.10.1); owner commands became permission prompts ([0009](../decisions/0009-owner-commands-by-permission-prompt.md), 0.13.0).
- Steered the lead to the migration intent after adopt: `next` names it (0.10.1).
- Re-approved after dropping U-1, whose whole job was a merge-written file: `PLAN-SHARED` (0.10.3).
- Answered an escalation with no command for it: re-approval turns it into a fix round (0.10.5).
- Approved mostly re-approvals of edits that carried out an answer: delegated approvals ([0008](../decisions/0008-delegated-approvals.md), 0.11.0).
- Ran `upgrade` twice, once from a dirty plugin tree, once from an older install that downgraded the CLI: `upgrade` refuses a downgrade (0.14.3); copying from a tag is M2.
- Approved a typo fix as a unit, because `fix` refused a security path: M2.
- Asked to wait for a fix on a `GATE-LEVEL` refusal: levels come from the merged tree (0.14.5).
- Deleted a duplicated board: `sync` relists before creating (0.15.0); empty-list robustness is M2.
- Ran `! cd` to unlock Bash: hooks fall back to the project folder (0.15.1).
- Re-sent standing run-mode instructions after a `/clear`: M2.

# Lead, outside `next`
- Removed a stale review mark by hand: `review record` ends it (0.13.3).
- Restarted a stopped unit after a delegated re-approval: 0.13.2.
- Removed a finished worktree that blocked a fix round: 0.13.4, then 0.14.2.
- Started units by hand while a merged intent awaited release: 0.14.0.
- Started work by hand while `next` held a pending approval, twice: M2.
- Reverted an approval whose prompt the owner had answered, unable to see it: M2.
- Started a fresh review after a fix round with no commit: 0.14.1.
- Rebased a branch to pick up a widened card: the scope hook reads the card (0.14.2).
- Restored the pinned CLI after the downgrade: 0.14.3.
- Restamped a `generated.at` written in local time marked `Z`: M2.
- Added level paths on the base for a profile gap: plan lint checks test placement (M2).
- Withheld the merge of a quick unit whose own AC fails: M2.

# Builders
- Merged the base into a restarted unit branch itself: M2.
- Ran a `.github` script bare because the guard blocked a redirect: M2.

All M2 items: [M2](../roadmap/m2.md).
