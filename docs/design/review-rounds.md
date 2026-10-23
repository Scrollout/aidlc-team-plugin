---
type: Design
title: Review rounds
description: What review record does with a verdict - fix rounds and their limit, send-backs, and which focus passes still count after a fix.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T19:40:00Z }
---

# Fix rounds
- A `fix` sends the builder a fix round, with the findings on the card ([Unit card](unit-card.md)).
- A `fix` that would start fix round `review.fixRounds + 1` (default 3) in its focus since the unit's last approval is recorded as `escalate`: the owner decides ([State](state.md#next)). The owner chose three rounds over one (2026-10-23).
- A reviewer's own `escalate` within the limit is recorded as `fix` too: the builder fixes it, or stops on its card's stop conditions and the lead brings the spec problem to the owner. In the second M4 pilot a reviewer escalated at round 1 on a claim the gate had already disproved (owner's choice, 2026-10-23).
- A `pass` while an AC has no tagged test on the branch is recorded as `fix`, with one finding per tag.
- A `pass` carrying a CONFIRMED finding is recorded as `fix`: the reviewer saw the defect, so it is fixed before the merge. PLAUSIBLE findings stay as notes on a pass (owner's choice, 2026-10-23).
- `review record` tells the reviewer what it recorded and why, naming the round and the limit.

# What counts after a fix
- Each round records the branch commit it reviewed.
- After a fix round, a focus other than `general` keeps its last `pass` when the commits since that commit touch none of its globs; `next` and the gate count it, so the builder's fix is not reviewed again for a concern it did not touch (owner's choice, 2026-10-23).
- `general` always reviews the current diff.
