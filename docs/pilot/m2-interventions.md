---
type: Report
title: M2 pilot interventions
description: Every step outside aidlc next in the M2 pilot, by the owner or the lead, with the cause and the change it needs, and the other findings of the run.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T07:30:00Z }
---

# Steps outside `next`
| # | Who | Step | Why | Becomes |
|---|---|---|---|---|
| 1 | Owner | Removed the deleted board from the profile by hand | Board deleted before the run | Setup, not a loop gap |
| 2 | Lead | Added the TypeScript test glob to `levels.unit` in the elaboration commit | `PLAN-TEST` needs a level path before build; nothing in `next` names this edit | Plan lint should name the profile edit as part of the plan, or the unit should own it |
| 3 | Owner | Ran `aidlc approve U-20` by hand after the lead's delegated `approve --auto` was denied | Claude Code auto mode refuses `approve --auto` as self-approval | Delegated approvals cannot run under auto mode; `next` must hand them to the owner |
| 4 | Owner | Ran `aidlc approve R-024` by hand, same denial | As 3; steer blocked every stop until it ran, including after the owner said "resume" | As 3, and steer must yield on a denied step |
| 5 | Lead | Merged U-20 before U-19 after `GATE-RUN` refused U-19 | Step 2's glob matched no tracked file until U-20 landed, so the project's profile self-test was red on the base | Goes away with 2 |
| 6 | Owner | Spotted the restarted U-20 builder still hanging after its merge; the lead stopped it and removed its locked worktree by hand | The builder recorded its report while it still waited on its own background work, and nothing checks for a builder alive after its unit merged | `next` names stopping such a builder and removing its worktree |

# Other findings
- Empty `## Checks` on every card: the card matches profile modules by `id`, as [Profile](../design/profile.md) documents, but this profile (written by a pilot unit in M1) keys them by `name`. Nothing validates module keys or flags a unit `modules:` entry that matches no module. The gate finds touched modules by path, so merge checks still ran.
- `next` prints requirement ids unpadded (`approve R-24`); the CLI resolves them, so cosmetic.
- Steer named `merge U-19` before the re-review's hand-back reached the lead; it reads state on disk, so the step was right, only early.
- Builders were not red-first: U-19's first write was refused, so its test and code came in one pass; U-20 the same.
- U-21's builder did not run the card's test runs (docs only; the gate ran them at merge).

After the release the owner accepted the retro's one proposal, a planning rule; the lead wrote it as a docs commit.
