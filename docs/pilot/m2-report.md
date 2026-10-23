---
type: Report
title: M2 pilot report
description: The second pilot, one intent with two parallel units on CLI 0.25.0 - wall time, tokens, rounds, every step outside next, the retro output and the result of each M2 exit criterion.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T07:30:00Z }
---

# Run
The same scratch copy as the [M1 pilot](report.md), reset to its M1 end state, CLI 0.25.0 pinned. The owner had deleted the throwaway board, so the board section was dropped from the profile before the run. One intent, I-3, finishing a requirement left open in M1: prove that the Go SDK installs with `go get` (through a local file proxy, since the copy has no remote) and that the TypeScript SDK installs from a packed tarball.

- Units: U-19 (Go) and U-20 (TypeScript), built in parallel; U-21 (docs, marks the requirement met) after both. The lead added U-21 to the owner's two units, as `PLAN-DEPENDS` and `PLAN-SHARED` required.
- Run mode: the owner answered elaboration in one sitting with "take the recommended option and log it"; re-approvals were delegated.
- Wall time: lead start to the last merge 64 min (elaboration 10 min, build to last merge 54 min). The requirement's re-approval waited 7 hours for the owner.

# Fix rounds and reviews
- U-19: one fix round. The general review found that `go get` inherited `GOPRIVATE`, `GONOPROXY` and `GOENV` and could bypass the file proxy; the re-review passed with no findings.
- U-20: one stop, scope too small (the project's profile self-test had to credit the new test folder). The lead widened the scope, which put the unit in the full lane; general and security reviews passed, one low finding.
- U-21: docs only, no review by design.

# Tokens
From the session transcript, deduplicated by message id; "processed" counts cache reads, "new" is input, cache writes and output.

| Role | Runs | Processed | New | Median run |
|---|---|---|---|---|
| Builder (sonnet; opus for fix and full lane) | 5 | 1.38 M | 0.15 M | 271 k |
| Reviewer, general (opus) | 3 | 0.65 M | 0.08 M | 238 k |
| Reviewer, security (opus) | 1 | 0.15 M | 0.02 M | 149 k |
| Lead (1 session) | - | 12.7 M | 0.31 M | - |

The lead is still about 85 % of the total: 4.2 M per unit against 5.9 M in M1.

# Steps outside `next` and other findings
Six steps outside `next` (one setup, two by the lead, three by the owner) and five other findings: [M2 pilot interventions](m2-interventions.md).

# Retro
`aidlc retro I-3`, as printed:

```
codes fired 3 or more times: none
escalations: none
owner commands that ran:
  approve I-3
  approve R-24
  approve U-19 U-20 U-21
proposals: project rule: builders stopped 1 times: in .aidlc/rules/planning.md, name the interfaces and folders a unit needs before approval
```

It misses three things: U-20's stop under "escalations" (the restart's report replaced the stop report on disk, while the counter behind the proposal kept it), the two hand-run re-approvals (a `!` command bypasses the guard, which is where owner commands are recorded) and the auto-mode denials. U-19's fix round is no escalation by design.

# M2 exit criteria
- `node --test` green on Linux, macOS and Windows, CI requires all three: **met**. The CI matrix runs all three; the last run on main (0.25.0) passed.
- Second pilot with no hand edit to state, no lead step outside `next`, every owner step one `next` names: **not met**. The two parallel units ran and merged, and no runtime state was edited by hand, but the lead edited the profile outside `next` and the owner ran two approvals that `next` had given to the lead ([steps](m2-interventions.md) 2 to 4).
- `aidlc retro` lists codes, escalations and interventions, at most three proposals: **not met**. It ran and proposed one change, but listed no escalation although U-20 stopped, and no hand-run owner command.
- CLI source within 3,000 lines: **met**, 2,882.

M2 stays open; the gaps are listed in [M2](../roadmap/m2.md#result).
