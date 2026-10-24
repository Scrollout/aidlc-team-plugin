---
type: Design
title: Merge mechanics
description: How aidlc merge and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, test runs, proof-revert and the CI history check.
status: draft
sources:
  - id: aws-aidlc
    resource: https://github.com/awslabs/aidlc-workflows
    title: AWS AI-DLC workflows
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T07:00:00Z }
---

# Trial merge
`aidlc merge U-<n>` runs in the lead's checkout on the base:
1. A temporary worktree at the base tip merges `unit/U-<n>` with `--no-ff --no-commit`. A conflict fails with `GATE-CONFLICT`: the builder merges the base into its branch and reports again.
2. Every condition of [Verification](verification.md) runs on that merged tree. The bundle indexes and log, and `profile.regen` commands for `profile.shared` files, are updated there.
3. Only when all pass, the merge is committed with five trailers (`Unit`, `Card`, `Review`, `Tested`, `Proof`) and the base fast-forwards to it. The unit's worktree and branch are then removed: a worktree whose tracked files are clean goes even when the host locked it (agent worktrees are locked), one with uncommitted tracked changes is kept and named.
Nothing touches the base until every check passes, so a failed gate leaves no half merge.

# Codes
`GATE-APPROVAL`, `GATE-DEPS`, `SCOPE-OUT`, `GATE-LANE`, `GATE-AC`, `GATE-LEVEL`, `GATE-PROOF`, `GATE-CHECK`, `GATE-REVIEW`, `GATE-CARD`, `GATE-SPECIALIST`, `GATE-OKF`, `GATE-SECURITY`, `ARCH-BOUNDARY`, `ARCH-CHECK`, `GATE-SHARED`, `GATE-CONFLICT`, `GATE-RUN`, `GATE-SKIP`. Each finding names its fix.

# Details
- **Scope:** every path in the unit's diff matches its scope. A builder's diff touching an `index.md`, a `log.md` or a `profile.shared` glob is `GATE-SHARED`: merge writes those.
- **Lane:** the lane of the diff's paths must not exceed the card's lane.
- **AC tests:** a file in the merged tree, outside the docs bundle, contains `U-<n>/AC-<k>` for each AC. With `profile.levels.<level>.paths` set, the file must match them, read from the merged tree's profile: a unit whose scope holds the profile can add a test location, and its reviewers see that change.
- **Test runs:** every `profile.levels.<level>.run`, from the merged tree's profile, runs there in full, outside the quick lane; a failure is `GATE-RUN`. The merge commit records them in a `Tested: <level>, …` trailer (`none` without one). A level's `needs` lists the environment variables its run requires: one unset fails it as `GATE-RUN` before it runs, so its tests cannot skip unseen. A level's `skip` is the pattern its runner prints for a skipped test: a level or proof-revert run whose output matches it fails as `GATE-SKIP`, quoting the line (M5 pilot 1, where a database-backed test skipped and counted as passed). AWS AI-DLC likewise runs one owner-approved verification command at every unit and requires a verified pass.[^aws-aidlc]
- **Proof-revert:** when every other check so far passed, the unit's changed paths outside every level's `paths`, the bundle and `.aidlc/` are put back as at the base in the index and the files (added files removed), so a run that checks `git diff` sees a clean tree, and each level whose `paths` hold one of the unit's tagged tests runs again: one that still passes is `GATE-PROOF`. The merge result is then restored. A quick-lane unit runs no level at all (U60) and skips it, as does no such level, and the merge says so; a test-only diff is proved by mutations ([Back-fill](backfill.md)). The trailer `Proof: <level>, …` records it (`none` when skipped).
- **Quick lane ACs:** a quick unit has no tagged tests and runs no level, so only each command its ACs name in a code span (`make <target>`, `npm run <target>`, `just <target>`, from `grid.runners`) runs on the merged tree; a failure is `GATE-AC`. A claim with no run behind it counts for nothing.[^aws-aidlc]
- **Checks:** `check` of every module whose `paths` the diff touches, then `security.check` and `architecture.checks`, run in the merged tree. Commands come from the owner's profile and run through the shell; git never does.
- **Review:** the last `general` verdict is `pass`, for the current diff hash and the current card hash. Each focus whose globs the diff touches needs its own `pass`, for the current diff or kept ([Review rounds](review-rounds.md)). A verdict file's `focus` defaults to `general`.
- **Architecture:** no denied edge of `architecture.graph` and every `architecture.checks` command passing, read from the merged tree, so the unit that adds a boundary is checked against it ([Requirements and architecture checks](architecture.md#architecture-rules)).

# push and fix
What `aidlc push` checks and what `aidlc fix` writes: [Everyday paths](paths.md).

# check --ci
After OKF validation and plan lint, every base commit after `profile.adopted` (all of them without it) is a gate merge with the `Unit`, `Card` and `Review` trailers and only in-scope or merge-written files, or a commit touching only allowed direct paths (`CI-MERGE`, `CI-COMMIT`). Architecture boundaries and checks run on the checked-out tree.

[^aws-aidlc]: AWS AI-DLC workflows
