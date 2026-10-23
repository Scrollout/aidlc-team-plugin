---
type: Report
title: M4 pilot 2 report
description: A short pilot of U33 to U35 on CLI 0.42.0 - fix-round counts, kept focus passes and confirmed findings, the stale in-flight marks that led to U36, and the findings for the next batch.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T18:40:00Z }
---

# Run
The scratch copy of the [M4 pilot](m4-report.md), CLI 0.42.0. Intent I-8 covers the second criterion of one requirement. U-31 is in the full lane, its scope a test under a `focus.security` glob plus one doc. U-32 is in the standard lane. They were built in parallel and both ended test-only. The run took about 72 minutes, about 31 of them waiting on the owner; each gate run took about 4.5 minutes.

# What U33 to U35 changed
- **U33 round count:** the U-32 fix was recorded as `fix round 1 of 3`, and the reviewer quoted the line.
- **U34 kept pass:** not exercised. U-31's doc had not drifted, so its diff ended entirely inside the security glob, and it needed no fix round.
- **U35:** a PLAUSIBLE note stayed on a pass (U-31 general). A pass carrying a CONFIRMED finding did not occur.
- **U32 send-back:** U-32's tests carried `_U32_AC1` in function names but no literal `U-32/AC-1` tag. The reviewer sent the unit back, the fix-round card listed both findings, and it ran on Opus after a CONFIRMED finding.
- **Proof:** both merges printed `proof skipped: no change outside the test paths` and record `Proof: none`.

# Findings for the next batch
- **A reviewer's own `escalate` skips the round limit.** In round 2 the U-32 reviewer escalated with one CONFIRMED finding: a test-only unit "cannot satisfy the gate". U-31's merge minutes earlier had already disproved it. The owner re-approved the unit to keep the spec, and round 3 passed. The limit counts only `fix` verdicts, so a wrong escalation reaches the owner at round 1.
- **Stale in-flight marks:** the steer hook misfired 4 times (review U-32 twice, restart U-32, review U-31 security). Each reviewer or builder was in a test-run call longer than 2 minutes. None were acted on. While U-31's security review was marked stale, `next` named it instead of U-32's pending re-review. U36 (0.43.0) fixes this; it has not been piloted yet.
- **Batch approval missed a requirement:** the lead batched `approve I-8 U-31 U-32`, then `next` asked separately for the cited R-013, still a draft. That cost one more owner prompt.
- **No decision doc:** no unit was a one-way door. Nothing deterministic asks for a decision when a unit could need one; see the [M4](../roadmap/m4.md) candidates.
- **Project test flake:** one suite failed once under concurrent load and passes alone. It is the project's, not the plugin's.

# Steps outside `next`
None. The lead ignored the 4 stale lines as briefed. The owner made three approvals: the plan batch, R-013, and keeping U-32's spec.

# Retro
No code fired 3 or more times. One escalation (U-32 general). Proposal: a profile check that catches what the reviewers found. It does not apply here, since the escalation was wrong.
