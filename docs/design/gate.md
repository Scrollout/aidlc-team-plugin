---
type: Design
title: Merge mechanics
description: How aidlc merge, push, fix and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, architecture rules and the CI history check.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T11:45:00Z }
---

# Trial merge
`aidlc merge U-<n>` runs in the lead's checkout on the base:
1. A temporary worktree at the base tip merges `unit/U-<n>` with `--no-ff --no-commit`. A conflict fails with `GATE-CONFLICT`: the builder merges the base into its branch and reports again.
2. Every condition of [Verification](verification.md) runs on that merged tree. The bundle indexes and log, and `profile.regen` commands for `profile.shared` files, are updated there.
3. Only when all pass, the merge is committed with `Unit`, `Card` and `Review` trailers and the base fast-forwards to it. The unit's worktree and branch are then removed.
Nothing touches the base until every check passes, so a failed gate leaves no half merge.

# Codes
`GATE-APPROVAL`, `GATE-DEPS`, `SCOPE-OUT`, `GATE-LANE`, `GATE-AC`, `GATE-LEVEL`, `GATE-PROOF`, `GATE-CHECK`, `GATE-REVIEW`, `GATE-CARD`, `GATE-SPECIALIST`, `GATE-OKF`, `GATE-SECURITY`, `ARCH-BOUNDARY`, `ARCH-CHECK`, `GATE-SHARED`, `GATE-CONFLICT`. Each finding names its fix.

# Details
- **Scope:** every path in the unit's diff matches its scope. A builder's diff touching an `index.md`, a `log.md` or a `profile.shared` glob is `GATE-SHARED`: merge writes those.
- **Lane:** the lane of the diff's paths must not exceed the card's lane.
- **AC tests:** a file in the merged tree contains `U-<n>/AC-<k>` for each AC. With `profile.levels.<level>.paths` set, the file must match them.
- **Checks:** `check` of every module whose `paths` the diff touches, then `security.check` and `architecture.checks`, run in the merged tree. Commands come from the owner's profile and run through the shell; git never does.
- **Review:** the last `general` verdict is `pass`, for the current diff hash and the current card hash. Each focus whose globs the diff touches needs its own `pass`. A verdict file's `focus` defaults to `general`.
- **Architecture:** `architecture.graph` prints `<from path> -> <to path>` edges, repo-relative. An edge whose `from` matches a boundary's `from` and whose `to` matches one of its `deny` globs is denied, unless `same: false` and both paths matched the boundary's `*` segments alike, or an approved decision listed in `except` covers it: one that lists the edge as a `<from> -> <to>` line, or one that lists no edge and so covers the whole boundary. Boundaries are read from the merged tree, so the unit that adds a boundary is checked against it.

# push and fix
- `aidlc push` lists the base commits the remote lacks. Each must be a merge with a `Unit` trailer, or touch only allowed direct paths: the bundle, `.aidlc/**`, and the files `init` writes. Then it pushes the base.
- `aidlc fix "<title>" --scope <glob>… [--requirement R-<n>…]` writes the next `units/U-<n>-<slug>.md`: no intent, one AC `(unit)` for a regression test that fails before the fix. A full-lane fix is refused: it needs an intent.

# check --ci
After OKF validation and plan lint, every base commit after `profile.adopted` (all of them without it) is a gate merge with all three trailers and only in-scope or merge-written files, or a commit touching only allowed direct paths (`CI-MERGE`, `CI-COMMIT`). Architecture boundaries and checks run on the checked-out tree.
