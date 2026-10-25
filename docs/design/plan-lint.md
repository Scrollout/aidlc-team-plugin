---
type: Design
title: Plan lint
description: The checks aidlc check runs on intents and units before the owner approves them, each with its code.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T06:40:00Z }
---

# Codes
Plan lint compares every unit except `status: dropped` and the IDs its caller skips (U4 passes the merged ones, derived from git). `aidlc check <files>` reports the findings on those files and on the intents of the units among them, since a plan-wide finding such as `PLAN-SLICE` lands on the intent; `approve` refuses a doc with a `PLAN-DECISION` or `PLAN-SLICE` finding on it or, for a unit, on its intent (first migration: per-file checks passed while I-3 lacked an end-to-end AC). Codes, all errors:
- `PLAN-DAG` a `depends` cycle (named in full) or an unknown unit.
- `PLAN-AC` a duplicate AC ID in a unit.
- `PLAN-LEVEL` an AC without a level, or with one `profile.levels` does not define.
- `PLAN-RESERVE` a malformed reservation (`<kind> <area>/<n>`), a kind `profile.reserve` lacks, or the same one in two units.
- `PLAN-SCOPE` a unit without `scope`, or two units whose scopes overlap with no `depends` path between them. When a bare file name (`Makefile`) overlaps only because it matches at any depth, the message suggests `/Makefile`.
- `PLAN-SHARED` a scope naming a file only merge writes: a bundle `index.md` or `log.md`, or a `profile.shared` entry.
- `PLAN-REQ` an intent or unit citing no requirement, or an unknown one ([Architecture](architecture.md)), printed as its file names it.
- `PLAN-BOARD` a unit missing a planned board value ([Board](board.md)).
- `PLAN-TEST` a non-quick unit whose scope overlaps none of an AC level's `paths`, so the AC's test has nowhere to go. A scope holding the profile passes: it can add the test location.
- `PLAN-MODULE` a unit `modules:` entry naming no profile module (`id`, or `name` when it has none).
- `PLAN-DECISION` a unit at a one-way door with no decision ([Approvals](approvals.md)).
- `PLAN-SKELETON` (warning) an intent whose first unit with a top-level AC depends on more than half of its units that reach the product (more than two): end to end comes last. Cut a walking skeleton first, the harness and the thinnest real path, then let each slice prove what it adds at the top level (second project).
- `PLAN-SLICE` an intent with live units none of which has an AC at the top level (the last level in `levels` with a `run`), unless the intent says `slice: "<why no end-to-end AC>"`. That waiver holds only for work outside the running product: an unapproved unit of a waived intent whose scope reaches a module's `paths` or a one-way door (`decisions.paths`, default `lanes.full`) is reported too, naming the glob, so a feature intent cannot skip its end-to-end test with a reason (owner, 2026-10-24: build fully vertical); or a unit whose `modules` name two or more modules while every AC is at the first level. Units are slices of an intent; this makes sure each intent ends to end once and that crossing a module is tested above unit level ([Grid](grid.md#tests)). Nothing is reported when no level runs.
- `PLAN-RUNBOOK` with `deploy` in the profile, a live intent (one with a unit not yet merged, or none yet), not a back-fill, that links no doc of type `Runbook`: how to roll back, what to watch, who to call. `init` ships the template ([Deployment and operation](operations.md)).
- `PLAN-PLATFORM` with `deploy` in the profile and no `deploy.platform`, the same intents: say where the deploy target is already defined, or `[]` when the project defines its own ([Deployment and operation](operations.md)).
- `PLAN-RUN` a warning from `aidlc check` on the bundle while live units exist and no level has a `run`: the gate would run no tests ([Build method from day one](method.md)). Warnings do not fail `check`.
- `PLAN-DESIGN` an unapproved full-lane unit without content under `# Domain` or `# Logical`, or a standard-lane one without `# Logical`, unless `design: "<why none>"` ([Design rows](design-rows.md)).
- `PLAN-GENERATED` a scope with a `generated` entry's outputs but none of its sources, or the reverse; or naming an existing file git does not track, which a builder cannot commit (a root-anchored `/Makefile` is compared as `Makefile`).
- `PLAN-DEPENDS` an AC whose code span names another unit's output with no `depends` path to it: a path in that unit's scope, or a `make`/`npm run`/`just` target (`grid.runners`) the base build file lacks, whose build file is in that unit's scope and whose doc names it.

# Profile keys it reads
- `decisions.paths`: one-way-door globs, by default `lanes.full` ([Approvals](approvals.md)).
- `generated`: `[{ "outputs": [<glob>], "sources": [<glob>] }]`, the files a generator writes and the files it reads. A unit that edits a source must commit the regenerated outputs, and one that needs an output changed must edit its source, so its scope names both. From the third M4 pilot, where a scope named a generated file without its source, then an untracked copy instead of the tracked output.
