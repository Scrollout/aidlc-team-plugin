---
type: Report
title: M4 scripted pilot report
description: A pilot with no owner present - a scripted project, a test owner's approvals, a headless lead with real builders and reviewers - on CLI 0.46.1 and 0.46.2.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T21:10:00Z }
---

# Run
The owner asked for pilots that run without them (2026-10-23).
- **Setup:** `tests/evals/pilot.mjs setup` builds a small project and approves its plan as a test owner (`owner@example.com`).
- **Units:** two are built as a builder left them. U-1 is right on security but breaks a data rule. U-2 follows an AC that contradicts its interface. The third, U-3, sits at a one-way door and is built by a real builder.
- **Lead:** a headless lead (`claude -p`, auto mode) followed `next` with real builder and reviewer agents.
- **Owner steps:** the owner's single step (re-approving U-2) ran through the script, never through an agent.

It took two lead runs, about 18 minutes and about 4.20 USD in total. There were no auto-mode refusals.

# Cases
| Case | Seen | How |
|---|---|---|
| U37 `PLAN-DECISION` before the decision | yes | setup: `check` reported it and `approve` refused U-3; a bundle-root link cleared it (0.46.1) |
| U38 reviewer escalate recorded as a fix round | yes | the U-2 reviewer escalated at round 1; `recorded fix … a reviewer escalate is a fix round first` |
| Stop surfaces (0.46.1) | yes | the U-2 builder stopped on the interface conflict and `next` named the stop at once; the lead fixed the AC, the test owner re-approved, `next` restarted the builder |
| U33 limit | yes | U-1's security focus took three fix rounds, then passed; none escalated |
| U34 kept pass | no | the general reviewer caught the data-rule break before security was reviewed, and every later fix touched security files |
| All three units merged | yes | |

# Bug found, fixed in 0.46.2
After a `fix` verdict, the builder that reported before the review still had a fresh heartbeat. U36 keeps a heartbeat fresh for 12 minutes, so `next` read the unit as `building` and started no fix round. A fix round now starts unless a builder was launched after the verdict, the same launch mark that settles a stop.

# Findings
- **Lead log times:** the headless lead wrote times in its log that are out of order, so the review files are the record for timing.
- **U34:** a real pilot only reaches it when a later focus fails after an earlier one passed. Its deterministic test covers it. The script cannot force it while the general reviewer reads every rule.
