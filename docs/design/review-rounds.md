---
type: Design
title: Review rounds
description: What review record does with a verdict - fix rounds and their limit, send-backs, and which focus passes still count after a fix.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T17:45:00Z }
---

# Fix rounds
- A `fix` sends the builder a fix round, with the findings on the card ([Unit card](unit-card.md)).
- A `fix` that would start fix round `review.fixRounds + 1` (default 3) in its focus since the unit's last approval is recorded as `escalate`: the owner decides ([State](state.md#next)). The owner chose three rounds over one (2026-10-23).
- A `pass` while an AC has no tagged test on the branch is recorded as `fix`, with one finding per tag.
- `review record` tells the reviewer what it recorded and why, naming the round and the limit.

# What counts after a fix
- Each round records the branch commit it reviewed.
- After a fix round, a focus other than `general` keeps its last `pass` when the commits since that commit touch none of its globs; `next` and the gate count it, so the builder's fix is not reviewed again for a concern it did not touch (owner's choice, 2026-10-23).
- `general` always reviews the current diff.
