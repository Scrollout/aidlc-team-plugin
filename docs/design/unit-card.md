---
type: Design
title: Unit card
description: The generated, read-only brief one builder works from and one reviewer checks against.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** One card per unit, rendered by `aidlc card U-<n>` from the approved unit doc at the base commit. Never hand-edited, never shared between units.

## Why per unit, not shared
- A shared card is a write hotspot for parallel workers and forces each one to load every unit.
- What units share (the DAG, interfaces) lives in approved docs that stay frozen during construction; the card links to them, pinned to the base commit.

## Contents (≤ 6,000 chars)
- Unit ID, title, goal and why, lane, model (see [Team](team.md#model-routing)), base commit, card hash.
- ACs with IDs; each becomes a test tagged `U-<n>/AC-<k>`.
- **Scope:** globs the builder may write.
- **Interfaces:** linked specs it consumes and provides (paths at the base commit).
- **Reserves:** e.g. migration number `regional/0005`.
- **Checks:** the profile commands for the unit's modules.
- **Out of scope** and **stop and report if** (interface change, scope too small, AC ambiguous).
- **Report format:** what the builder returns.

## Rules the CLI enforces
- Rendered from `git show <base>:<unit doc>`, so worktree edits cannot change a card.
- `aidlc card` refuses an unapproved or stale unit.
- Before parallel start, units whose scopes overlap or whose reservations collide are refused.
- The card hash goes into the merge trailer `Card: <hash>`; the reviewer gets the same card, and a mismatch fails the merge gate.
- A worker never changes an interface. It stops and reports; the lead updates the spec, the owner re-approves if it is a one-way door, and affected cards are re-rendered.

## Quick lane
The card shrinks to goal, scope and checks. It is still generated; it costs nothing and keeps one code path.
