---
type: Report
title: M4 pilot report
description: A short pilot of the first M4 batch on CLI 0.38.0 - owner badges and blocks, the card fixes, upgrade output, proof lines and the findings for the next batch.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T16:40:00Z }
---

# Run
The scratch copy of the [M3 pilot](m3-report.md), CLI 0.38.0. Intent I-7, the owner's pick of three: version polish, citing R-057. U-29 and U-30 built in parallel.

# What U29 to U31 changed
- **Badges:** `next` put 👉 on each of the four owner steps (elaborate, approve I-7, approve the plan, release), and on no lead step. No ⛔ fired. The lead ended each owner step with a 👉 **Your action** block holding the words to type, and every other turn with ✅.
- **Card:** requirement ids printed as their files name them (`R-057`), plain interface lines were kept, and the proof note named the levels.
- **Upgrade:** it printed the release it copied and the commands that fetch a newer one.
- **Proof:** both merges recorded `Proof: unit`; no `GATE-PROOF`.

# Findings for the next batch
- A unit sent back for an AC with no tagged test gets an identical card with no reason on it; the lead pasted `next`'s line into the builder's prompt. The AC said existing tests "still pass unchanged", so the builder tagged none, and the reviewer passed it without flagging the missing tag.
- The retro does not list a send-back.
- Both builders wrote code before tests and ran part of the unit run; the reviewers ran all three levels green.
- Steer named a review before the builder's hand-back reached the lead; it was right.

# Steps outside `next`
One: the lead added `next`'s send-back line to the fix-round prompt, since the card carried no reason.
