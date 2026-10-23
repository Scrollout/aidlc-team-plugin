---
type: Design
title: Unit card
description: The generated, read-only brief one builder works from and one reviewer checks against.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T14:00:00Z }
---

# Why per unit, not shared
- A shared card is a write hotspot for parallel workers and forces each one to load every unit.
- What units share (the DAG, interfaces) lives in approved docs that stay frozen during construction; the card links to them, pinned to the base commit.

# Contents (≤ 6,000 chars)
- Unit ID, title, goal and why, lane, model (see [Team](team.md#model-routing)), base commit, card hash.
- **Project rules:** each `.aidlc/rules/*.md` at the base commit, before the ACs, except a rule named after a `profile.focus` key, which only that focus's reviewer reads. Builders run without `CLAUDE.md`, so this is how a project's conventions reach them; the rules count toward the cap.
- ACs with IDs; each becomes a test tagged `U-<n>/AC-<k>`.
- **Scope:** globs the builder may write.
- **Interfaces:** linked specs it consumes and provides (paths at the base commit).
- **Requirements:** the requirement docs the unit cites, which the builder meets and every review checks.
- **Findings to fix:** in a fix round, the findings of each focus whose last verdict for the current diff is `fix`. After an escalation the owner re-approved, its findings are listed as answered by that re-approval, for the reviewer to report again only if one still holds against the spec as it is now.
- **Test runs:** every level's `run`; the builder and the reviewer run each in full, and the gate again on the merge result, then once more with the unit's code reverted, when each level holding a tagged test must fail.
- **Reserves:** e.g. migration number `regional/0005`.
- **Checks:** the profile commands for the unit's modules, matched by `id`, or `name` when a module has none.
- **Out of scope** and **stop and report if** (interface change, scope too small, AC ambiguous).
- **Report format:** what the builder returns.

# Rendering
- The template is `plugin/cli/card.md`, copied into projects with the CLI. A project's `.aidlc/templates/card.md` overrides it.
- Card hash: sha256 of the unit doc at the base plus the rendered card without its base line, so a base that moved for other units leaves the hash, and the reviews made against it, current.
- `aidlc card` also writes `.git/aidlc/cards/U-<n>.json` (hash, base, lane, model). This is runtime data, never committed, and re-rendering rewrites it. `start` checks its base and the model hook compares against its model.
- Model routing defaults sit in `cli.json`; `profile.models` overrides them, including `complex` globs. The card prints the builder's `Model:` and, on the standard card, the `Review model:` from `models.review`.

# Rules the CLI enforces
- Rendered from `git show <base>:<unit doc>`, so worktree edits cannot change a card.
- `aidlc card` refuses an unapproved or stale unit.
- Before parallel start, units whose scopes overlap or whose reservations collide are refused.
- The card hash goes into the merge trailer `Card: <hash>`; the reviewer gets the same card, and a mismatch fails the merge gate.
- A worker never changes an interface. It stops and reports; the lead updates the spec, the owner re-approves if it is a one-way door, and affected cards are re-rendered.

# Quick lane
The card keeps goal, ACs, scope, checks and out of scope, and drops what only matters for tests and review: interfaces, requirements, reserves, findings. Its ACs are what "done" means; they need no tagged tests and get no reviewer. It is still generated; it costs nothing and keeps one code path.

Interface links resolve like OKF links: from the unit doc's folder, or from the bundle root when they start with `/`. The card shows repo paths.
