---
type: Report
title: M2 re-pilot report
description: The third pilot, two parallel units on CLI 0.29.0 after the M2 fixes - wall time, tokens, rounds, the researcher, the retro and each M2 exit criterion.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T10:50:00Z }
---

# Run
The scratch copy of the [M2 pilot](m2-report.md) on CLI 0.29.0, to check U20 to U23. Intent I-4: an etcd implementation of an existing coordinator interface, tested against a real etcd in CI. Two units in parallel: U-22 (the implementation, research hold on its fencing token) and U-23 (CI runs the suite on etcd).

- Run mode as in M2: recommended options taken and logged; re-approvals delegated.
- Wall time: lead start to the last merge 136 min (setup 6 min, elaboration 9 min, build to last merge 120 min). (M2: 64 min); the extra time is U-22's rounds.
- Researcher: one run, Sonnet, 47 s. The decision drafted from its digest was approved by the owner.

# Fix rounds and reviews
- U-23: one build; both reviews passed clean.
- U-22: three fix rounds, all CONFIRMED findings:
  1. General: a failed campaign deleted the wrong candidate key.
  2. General: one spelling the project lint rejects; as the focus's second `fix` it became an escalation, and the owner re-approved the unit.
  3. Security: a campaign could win on a revoked key (3 of 3). Then both focuses passed.
- The delegated `approve --auto R-011` ran with no auto mode refusal.

# Tokens
Counted as in M2.

| Role | Runs | Processed | New | Median run |
|---|---|---|---|---|
| Builder (opus, full lane) | 5 | 5.48 M | 0.36 M | 665 k |
| Reviewer, general (opus) | 6 | 2.63 M | 0.30 M | 475 k |
| Reviewer, security (opus) | 3 | 1.65 M | 0.15 M | 568 k |
| Researcher (sonnet) | 1 | 0.02 M | 0.02 M | 33 k |
| Lead (1 session) | - | 27.8 M | 0.19 M | - |

The lead is 74 % of the total (M2: 85 %), but 13.9 M per unit (M2: 4.2 M): each round is a lead turn re-reading its context.

# Steps outside `next` and other findings
Five steps outside `next` (one setup, three by the lead, one by the owner), plus other findings: [M2 re-pilot interventions](m2-repilot-interventions.md).

# Retro
`aidlc retro I-4`, as printed:

```
codes fired 3 or more times: none
escalations:
  U-22 review general escalated with 1 findings at 2026-10-23T09:28:08.578Z
owner approvals and commands:
  2026-10-23T08:27:06.322Z upgrade
  2026-10-23T08:29:06.031Z upgrade
  2026-10-23T08:35:06.413Z approve I-4 by <owner>
  2026-10-23T08:35:58.604Z approve R-011 by <owner>
  2026-10-23T08:36:10.045Z approve U-22 by <owner>
  2026-10-23T08:36:10.045Z approve U-23 by <owner>
  2026-10-23T09:32:52.762Z approve U-22 by <owner>
proposals: new check: reviews escalated 1 times: a profile check (modules[].check or architecture.checks) that catches what the reviewers found
```

It lists the escalation, the re-approval and the owner's prompts; the proposal fits the gap (the fix round never ran the project lint). One error: the approval of the cited decision is missing. Both `upgrade` lines are the owner's, though the lead saw no prompt: a hook's `ask` prompts the owner even in auto mode ([0009](../decisions/0009-approval-prompt.md)).

# M2 exit criteria
- `node --test` green on Linux, macOS and Windows, required by CI: **met**. The last run on main (0.29.0) passed.
- Second pilot with no hand edit to state, no lead step outside `next`, and every owner step one `next` names: **not met**. No state was hand-edited, and M2's auto mode refusals and profile edit are gone, but the lead released the research hold and reshaped the digest outside `next`. `next` also named the escalation without naming the owner's command ([steps](m2-repilot-interventions.md) 2 to 5).
- `aidlc retro` lists codes, escalations and interventions, with at most three proposals: **met**, with the error above carried as a fix.
- CLI source within 3,000 lines: **met**, 2,956.

M2 stays open on one criterion; the fixes are listed in [M2](../roadmap/m2.md#result).
