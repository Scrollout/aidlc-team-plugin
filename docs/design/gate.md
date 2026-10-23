---
type: Design
title: Merge mechanics
description: How aidlc merge, push, fix and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, architecture rules and the CI history check.
status: draft
sources:
  - id: aws-aidlc
    resource: https://github.com/awslabs/aidlc-workflows
    title: AWS AI-DLC workflows
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T17:45:00Z }
---

# Trial merge
`aidlc merge U-<n>` runs in the lead's checkout on the base:
1. A temporary worktree at the base tip merges `unit/U-<n>` with `--no-ff --no-commit`. A conflict fails with `GATE-CONFLICT`: the builder merges the base into its branch and reports again.
2. Every condition of [Verification](verification.md) runs on that merged tree. The bundle indexes and log, and `profile.regen` commands for `profile.shared` files, are updated there.
3. Only when all pass, the merge is committed with `Unit`, `Card` and `Review` trailers and the base fast-forwards to it. The unit's worktree and branch are then removed.
Nothing touches the base until every check passes, so a failed gate leaves no half merge.

# Codes
`GATE-APPROVAL`, `GATE-DEPS`, `SCOPE-OUT`, `GATE-LANE`, `GATE-AC`, `GATE-LEVEL`, `GATE-PROOF`, `GATE-CHECK`, `GATE-REVIEW`, `GATE-CARD`, `GATE-SPECIALIST`, `GATE-OKF`, `GATE-SECURITY`, `ARCH-BOUNDARY`, `ARCH-CHECK`, `GATE-SHARED`, `GATE-CONFLICT`, `GATE-RUN`. Each finding names its fix.

# Details
- **Scope:** every path in the unit's diff matches its scope. A builder's diff touching an `index.md`, a `log.md` or a `profile.shared` glob is `GATE-SHARED`: merge writes those.
- **Lane:** the lane of the diff's paths must not exceed the card's lane.
- **AC tests:** a file in the merged tree, outside the docs bundle, contains `U-<n>/AC-<k>` for each AC. With `profile.levels.<level>.paths` set, the file must match them, read from the merged tree's profile: a unit whose scope holds the profile can add a test location, and its reviewers see that change.
- **Test runs:** every `profile.levels.<level>.run`, from the merged tree's profile, runs there in full on every lane; a failure is `GATE-RUN`. The merge commit records them in a `Tested: <level>, …` trailer (`none` without one). AWS AI-DLC likewise runs one owner-approved verification command at every unit and requires a verified pass.[^aws-aidlc]
- **Proof-revert:** when every other check so far passed, the unit's changed paths outside every level's `paths`, the bundle and `.aidlc/` are put back as at the base in the index and the files (added files removed), so a run that checks `git diff` sees a clean tree, and each level whose `paths` hold one of the unit's tagged tests runs again: one that still passes is `GATE-PROOF`. The merge result is then restored. A quick-lane unit, a test-only diff or no such level skips it, and the merge says so. The trailer `Proof: <level>, …` records it (`none` when skipped).
- **Quick lane ACs:** a quick unit has no tagged tests, so each command its ACs name in a code span (`make <target>`, `npm run <target>`, `just <target>`, from `grid.runners`) runs on the merged tree; a failure is `GATE-AC`. A claim with no run behind it counts for nothing.[^aws-aidlc]
- **Checks:** `check` of every module whose `paths` the diff touches, then `security.check` and `architecture.checks`, run in the merged tree. Commands come from the owner's profile and run through the shell; git never does.
- **Review:** the last `general` verdict is `pass`, for the current diff hash and the current card hash. Each focus whose globs the diff touches needs its own `pass`, for the current diff or kept ([Review rounds](review-rounds.md)). A verdict file's `focus` defaults to `general`.
- **Architecture:** `architecture.graph` prints `<from path> -> <to path>` edges, repo-relative. An edge whose `from` matches a boundary's `from` and whose `to` matches one of its `deny` globs is denied, unless `same: false` and both paths matched the boundary's `*` segments alike, or an approved decision listed in `except` covers it: one that lists the edge as a `<from> -> <to>` line, or one that lists no edge and so covers the whole boundary. Boundaries are read from the merged tree, so the unit that adds a boundary is checked against it.

# push and fix
- `aidlc push` lists the base commits the remote lacks; on a base never pushed, those after the commit that added `.aidlc/profile.json`, since history before the plugin follows no gate. Each must be a merge with a `Unit` trailer, or touch only allowed direct paths: the bundle, `.aidlc/**`, and the files `init` writes. Then it pushes the base.
- `aidlc fix "<title>" --scope <glob>… [--requirement R-<n>…]` writes the next `units/U-<n>-<slug>.md`: no intent, one AC `(unit)` for a regression test that fails before the fix. A fix on a full-lane path needs the owner's approval, like any unit outside the quick lane.

# check --ci
After OKF validation and plan lint, every base commit after `profile.adopted` (all of them without it) is a gate merge with all three trailers and only in-scope or merge-written files, or a commit touching only allowed direct paths (`CI-MERGE`, `CI-COMMIT`). Architecture boundaries and checks run on the checked-out tree.

[^aws-aidlc]: AWS AI-DLC workflows
