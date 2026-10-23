---
type: Report
title: M2 re-pilot interventions
description: Every step outside aidlc next in the M2 re-pilot on CLI 0.29.0, by the owner or the lead, with the cause and the change it needs, and the other findings of the run.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T10:50:00Z }
---

# Steps outside `next`
| # | Who | Step | Why | Becomes |
|---|---|---|---|---|
| 1 | Owner | Updated the installed plugin by hand before `upgrade` | `upgrade` copies from the installed plugin, which was still 0.25.0 | Setup: `upgrade` names the plugin update when the installed release is older than the newest |
| 2 | Lead | Answered a steer block demanding the researcher again while it ran | No in-flight marker for the researcher, as builders and reviewers have | `next` waits for a running researcher |
| 3 | Lead | Split the digest and added the project's TL;DR and `generated` lines, a hand edit the brief forbids | The brief's size cap counts the body only and ignores the project's doc rules | The brief takes the project's doc limits and required lines from its profile and rules |
| 4 | Lead | Ran `aidlc hold U-22 off` after the digest was filed and the decision approved | Filing the answer never releases a `research:` hold, and `next` never names the release | A research hold is released when its digest is filed |
| 5 | Owner | Re-approved U-22 to answer the escalation; the lead offered a `!` command, which the mobile app does not run | `nextEscalated` names no command, and two fix hints in the CLI still say `!` | Plain-word approval: the owner types `approve U-22` |

# Other findings
- The second `fix` in a focus escalates whatever its severity, so a one-word lint fix reached the owner. The reviewer is not told why its verdict was changed.
- After the owner's re-approval, the escalated findings show on the card as "answered by the spec change", though the spec and the code were unchanged. The reviewer still flagged the spelling again. A code comment promises a fix round, but the code asks for a re-review first.
- The fix-round builder did not run the project lint, which is in no card check or level run. The retro proposed the matching check.
- After the security fix, `next` restarted at the general focus, so every round re-runs every focus: six general reviews for one unit.
- The U-23 builder could not run its CI step script in its worktree because the host's isolation refused it. The reviewers ran it.
- The retro reads approvals only from the intent's own docs, so the approval of a decision those docs cite is missing.
