---
type: Decision
title: 0016 The CLI budget is 5,000 lines
description: The CLI source budget rises from 4,000 to 5,000 lines for the v2 checks, because the incident rules turned out to be evidence for general rules, not patches to delete, and v2's own data already lives outside the code.
status: superseded by ADR-0017
decision-makers: the owner
date: 2026-10-27
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T01:10:00Z }
---

# The CLI budget is 5,000 lines

## Context and Problem Statement
[0013](0013-a-deterministic-ai-dlc.md) kept the CLI at 4,000 lines on one condition: room was to come from moving rules into data and retiring superseded incident patches, and a raise needed its own decision (plan decision D5). The CLI stood at 3,997 lines, and M15 to M19 add about 25 checks.

The audit for B149 read all 39 incident citations in the design docs:
- **31 are evidence:** a general rule that names the incident that showed it was needed, such as `PLAN-SKELETON`, `PLAN-CARD` and the base-CI holds. Deleting the citation saves no code, and deleting the rule loses a check a test pins.
- **8 belong to the slice rules:** `slices.md`, the slice parts of `plan-lint.md` and `bolt-card.md`. Increments replace them almost line for line (B152, B159), so they free about 50 lines, not 300.
- **Data is already outside the code:** check messages and templates already live in `cli.json` (75 KB) and the template files. What v2 adds as data (kind matrix, vocabularies, naming grammar, doc schemas, stack packs) goes there too, so the new code is the checks themselves.

## Considered Options
1. Keep 4,000 and fit v2 by packing lines. That breaks the budget's intent, which is a small CLI anyone can read, not a short one.
2. Keep 4,000 and drop part of v2. That leaves the drift 0013 exists to stop.
3. **Raise the budget to 5,000 lines, and keep every v2 rule as data wherever a check can read it.**

## Decision Outcome
Option 3, under D5's condition: consolidation can't make the room. [Overview](../design/overview.md) sets `CLI source` to 5,000 lines, and the budget test enforces it. Any further raise needs another decision.

The budget exists so the CLI stays readable and reviewable. 5,000 lines of plain code with its rules in data serves that better than 4,000 lines packed to fit.

## More Information
Revisit when:
The CLI passes 4,750 lines before M19 is built: then the matrix and doc schema checks move further into data first.
