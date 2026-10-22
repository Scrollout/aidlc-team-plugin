---
type: Report
title: M1 pilot report
description: The U9 pilot on a scratch copy of a multi-service project - wall time, tokens, fix rounds, denials and the result of each U9 criterion.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T16:21:38Z }
---

# Run
A scratch copy of a real multi-service project that used another workflow tool, with a throwaway board. Two intents, both merged by `aidlc merge`:
- I-1 migration (adopt, docs, profile, architecture baseline, module audit, cleanup): 11 units merged, U-1 dropped after review.
- I-2 feature: 6 units, U-15 and U-16 built in parallel.

Wall time from adopt to the last merge: about 4 hours, while the plugin went from 0.10.0 to 0.16.1 in 26 releases, most of them fixes for pilot findings. Per unit, first commit to merge: median 11 min, longest 74 min (U-16, with waits for upgrades).

# Fix rounds and reviews
Fix rounds: U-3, U-7, U-15 (no commit) and U-16, one each; all other units passed their first review. Escalations: U-1 (dropped), U-3 (scope missed a test folder), U-15 (finding answered by a spec change). Quick-lane units had no review, by design.

# Tokens
From the session transcripts; "processed" counts cache reads, "new" is input, cache writes and output.

| Role | Runs | Processed | New | Median run |
|---|---|---|---|---|
| Builder | 33 | 14.9 M | 1.1 M | 138 k |
| Reviewer, general | 20 | 4.7 M | 0.59 M | 175 k |
| Reviewer, security | 9 | 1.3 M | 0.21 M | 134 k |
| Lead (3 sessions) | - | 106.7 M | 0.91 M | - |

The lead dominates: a long session re-reads its context every turn. Always-on context after U-2: `CLAUDE.md` and `AGENTS.md` 597 chars, the session status 267 chars, the skill and agent descriptions 620 chars; about 370 tokens, under the 1,500 budget.

# Denials
- Hook denials, correct: the model hook refused a reviewer on the builder's model, and the guard turned owner commands into permission prompts.
- Over-broad: the scope hook refused a write a widened card allowed, reading the old card on the branch (fixed 0.14.2); the guard blocked a `.github` script run whose output was redirected (M2), and every Bash call while the shell sat in `.git/aidlc` (fixed 0.15.1).
- Auto-mode denials, all correct: `upgrade` by the lead, moving a unit branch with `git branch -f`, and a memory write of rules relayed by a peer session.

# Interventions
Every manual step, by the owner or by the lead outside `next`, and the fix or M2 item it became: [Interventions](interventions.md).

# U9 criteria
- AC-1 recorded here, with tokens from transcripts rather than per-card counters.
- AC-2 met: see [Interventions](interventions.md).
- AC-3 met. Two `/clear`s while builders ran: no repeated question, no duplicate builder, no lost work; run-mode instructions had to be re-sent (M2). A clear mid-elaboration in the eval fixture first led back to unit work; with 0.17.0 the retest resumed at the draft's open points and asked no answered question.
- AC-4 met: after adoption `check --ci` is green, the requirements are approved, and the baseline violations became units or the approved cleanup decision.
- M1 exit "no hand edits to state": one, a stale review mark removed by hand (fixed 0.13.3).
- U7/AC-3 checked on Claude Code 2.1.308: with the CLI moved away, the guard denied `git push`. The Stop hook then blocked every turn end until the owner stepped in (fixed 0.17.1).

# Prompt evals (U8/AC-5)
Run 2026-10-22 on 0.16.1, scored by `tests/evals/run.mjs`: all five found.
- The opus reviewer recorded `fix` with five findings: the endpoint without `requireRole`, two hollow AC tests, the shell injection (rated plausible), the out-of-scope edit.
- The sonnet builder stopped on the Price API change, a one-way door, instead of changing it; the owner approved the decision the lead wrote.
- Seen on the way (M2): `next` asked only to re-approve the unit, not the new decision it cites; steer kept blocking at a stopping point the owner had set in the prompt.
