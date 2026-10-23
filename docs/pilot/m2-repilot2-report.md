---
type: Report
title: M2 re-pilot 2 report
description: The fourth pilot, two parallel units on CLI 0.32.0 after U24 to U26 - wall time, tokens, plain-word approval, the research loop, every step outside next, the retro and each M2 exit criterion.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T12:20:00Z }
---

# Run
The scratch copy of the [M2 re-pilot](m2-repilot-report.md), CLI 0.32.0. Intent I-5, the owner's pick of two the lead offered: a check that each module builds on its own. U-24 adds the check and its self-test; U-25 runs it in CI. One research hold on U-24: what building on its own must verify.

- Wall time: lead start to the last merge 39 min (elaboration with research 11 min, build to last merge 28 min).
- Reviews: one build each, general and security passed, no fix rounds. U-25's general pass carried two non-blocking findings; a pass starts no fix round, so a one-word slip in a doc summary landed.
- Approvals: the owner typed `approve I-5`, `approve R-023` and `approve U-24 U-25 <decision>`; the prompt hook stamped each and the lead committed. The delegated re-approval of R-023 ran with no auto mode refusal.

# Tokens
Counted as in M2.

| Role | Runs | Processed | New |
|---|---|---|---|
| Builder (opus, full lane) | 2 | 0.91 M | 0.10 M |
| Reviewer, general and security (opus) | 4 | 0.46 M | 0.08 M |
| Researcher (sonnet) | 1 | 0.05 M | 0.03 M |
| Lead (1 session) | - | 21.6 M | 0.10 M |

The lead is 94 % of the total. Its session was resumed from the earlier runs, so each turn re-read the context of two finished intents: 10.8 M per unit, for units that needed no fix round. A fresh or cleared session per intent is the obvious saving.

# Steps outside `next`
| # | Who | Step | Why | Becomes |
|---|---|---|---|---|
| 1 | Lead | Asked the researcher to resend its digest | It overran the whole-file cap (5,037 chars) and lacked the project's TL;DR line, which the project's own docs check requires | The brief tells the lead to send `aidlc check` findings back to the researcher, never to edit the digest |
| 2 | Lead | Ran `aidlc hold U-24 off` on the owner's word | The question held `<m>`, which the open-points check read as a template placeholder | Fixed in 0.32.1: plan fields are no open points |
| 3 | Lead | Ran `aidlc retro` one action early, before the worktree cleanup `next` named | A lead slip; nothing was lost | None |

What 0.30 to 0.32 fixed held: `next` waited while the researcher ran, the digest and its decision went in one commit, every owner step named the words to type, and no `!` command was offered.

# Retro
`aidlc retro I-5` listed no codes and no escalations, the owner's `upgrade`, every typed approval including the cited decision, and no proposals. The delegated re-approval is not listed, since the retro lists the owner's approvals only.

# M2 exit criteria
- `node --test` green on Linux, macOS and Windows, required by CI: **met** (0.32.1).
- Second pilot with no hand edit to state, no lead step outside `next`, and every owner step one `next` names: **not met**. No state was hand-edited and every owner step was named, but steps 1 and 2 were the lead's. Step 2 is fixed in 0.32.1; step 1 is the last open gap.
- `aidlc retro` lists codes, escalations and interventions, with at most three proposals: **met**.
- CLI source within 3,000 lines: **met**, 2,975.
