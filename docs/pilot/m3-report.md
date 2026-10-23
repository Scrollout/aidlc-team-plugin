---
type: Report
title: M3 pilot report
description: The M3 pilot, three units on CLI 0.35.0 - project rules on the card, proof-revert on every merge and a demo of its refusal, the bug the demo found, tokens and each M3 exit criterion.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T14:50:00Z }
---

# Run
The scratch copy of the [M2 pilots](m2-repilot2-report.md), in a cleared lead session on CLI 0.35.0. The owner picked a builder rule from three the lead offered, committed as `.aidlc/rules/builder.md` before any card: every exported Go function, method or type a unit adds has a doc comment that starts with its name. Intent I-6, the owner's pick of three: every binary reports its version. U-26 and U-27 built in parallel; U-28, docs only, after both.

- Wall time: lead start to the last merge 49 min.
- Approvals: all typed by the owner. Auto mode again refused the lead's delegated re-approval of R-057; `next` handed it to the owner, who typed it.
- Steps outside `next`: none. The lead ran `upgrade` from the installed plugin after the pinned copy refused, as that refusal says.

# Project rules on the card
Every card carried the rule, the docs-only card too. U-27 added the one exported function, with a doc comment that starts with its name; its general review, re-review and security review each checked the rule. U-26 added no exported code and commented its function anyway.

# Proof-revert
- The merges recorded `Proof: unit` (U-26), `Proof: unit, integration` (U-27) and `Proof: none` with "proof skipped: quick lane" (U-28). No `GATE-PROOF` fired: both units' tests call the code they test.
- Demo, on a throwaway clone: U-26's tagged tests replaced by tests that touch no code, then `aidlc merge U-26`. On 0.35.0 it merged. The pilot's unit run includes a generated-files check, `git diff --exit-code` over paths that hold U-26's code; the revert left the index at the merge result, so that check failed on the revert itself and the gate read it as the tests failing.
- 0.35.1 reverts the index as well. The same demo then refused the merge with `GATE-PROOF level unit still passes with U-26's changes outside the test paths reverted`. The pilot's own `Proof:` lines came from 0.35.0, so they alone prove nothing for those two units.

# Tokens
| Role | Runs | Processed | New |
|---|---|---|---|
| Builder (sonnet for U-26 and U-28, opus for U-27) | 4 | 1.01 M | 0.14 M |
| Reviewer (opus) | 4 | 0.45 M | 0.10 M |
| Lead (1 cleared session) | - | 9.7 M | 0.17 M |

The lead is 87 % of the total, but 3.2 M per unit against 10.8 M in re-pilot 2: clearing the session after a release paid off.

# Other findings
- The card prints `R-57` for R-057, and drops interface bullets that are not links.
- The card's proof line lists every level's test globs, long in a project with many.
- The U-26 builder wrote code and tests in one step and never saw a red run; proof-revert is what checks it.
- U-26's general review passed with two non-blocking findings, which landed unfixed.
- The retro lists the pinned copy's refused `upgrade` as an owner command.

# M3 exit criteria
- A pilot unit's card carries a project rule, and its builder and reviewer follow it: **met** (U-27).
- A tagged test that still passes with its unit's change reverted refuses the merge, and the owner sees why: **met** on 0.35.1, by the demo on a clone of the pilot; the pilot's own merges were green.
- CLI source within 3,400 lines: **met**, 3,013.
