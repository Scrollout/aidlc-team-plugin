---
type: Design
title: Merge mechanics
description: How aidlc merge and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, test runs, proof-revert and the CI history check.
status: stable

generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T11:46:55Z }
---

# Trial merge
`aidlc merge U-<n>` runs in the lead's checkout on the base:
1. A temporary worktree at the base tip merges `unit/U-<n>` with `--no-ff --no-commit`. A conflict fails with `GATE-CONFLICT`: the builder merges the base into its branch and reports again.
2. The bundle indexes and log, `profile.regen` commands for `profile.shared` files, and the [codebase map](codebase-map.md) are updated there and staged first, so every condition of [Verification](verification.md) then runs on the tree the merge will commit: a docs check that wants each doc in its index passes for a unit that adds a doc (first migration).
3. Only when all pass, the merge is committed with five trailers (`Unit`, `Card`, `Review`, `Tested`, `Proof`) and the base fast-forwards to it. The unit's worktree and branch are then removed: a worktree whose tracked files are clean goes even when the host locked it (agent worktrees are locked), one with uncommitted tracked changes is kept and named.
Nothing touches the base until every check passes, so a failed gate leaves no half merge.

# Codes
`GATE-APPROVAL`, `GATE-DEPS`, `SCOPE-OUT`, `GATE-LANE`, `GATE-AC`, `GATE-LEVEL`, `GATE-PROOF`, `GATE-CHECK`, `GATE-REVIEW`, `GATE-CARD`, `GATE-SPECIALIST`, `GATE-OKF`, `GATE-SECURITY`, `ARCH-BOUNDARY`, `ARCH-CHECK`, `GATE-SHARED`, `GATE-CONFLICT`, `GATE-RUN`, `GATE-SKIP`, `GATE-SECRET`, `GATE-NAME` ([Naming rules](names.md)), `GATE-IDENTITY` ([Workload identity](workload-identity.md)). Level runs add `gate.fresh` (no test cache). A builder launched after a refusal is a fix round. Each finding names its fix.

# Details
- **Scope:** every path in the unit's diff matches its scope. A builder's diff touching an `index.md`, a `log.md` or a `profile.shared` glob is `GATE-SHARED`: merge writes those.
- **Secrets:** no line the unit's diff adds matches a secret pattern of the secrets hook (`GATE-SECRET`), so one written from Bash, which that hook never sees, stops the merge.
- **Lane:** the lane of the diff's paths must not exceed the card's lane.
- **AC tests:** a file in the merged tree, outside the docs bundle, contains `U-<n>/AC-<k>` for each AC. With `profile.levels.<level>.paths` set, the file must match them, read from the merged tree's profile: a unit whose scope holds the profile can add a test location, and its reviewers see that change.
- **Test runs:** every `profile.levels.<level>.run`, from the merged tree's profile, runs there in full, a quick-lane unit's first level only. A failure is `GATE-RUN`, or `GATE-BASE` when the level fails on the base alone too: the base is red ([Base CI](base-ci.md)). The merge records them in a `Tested: <level>, …` trailer (`none`: none ran). A level's `needs` lists the environment variables its run requires: one unset fails it as `GATE-RUN` before it runs. A level's `skip` is the pattern its runner prints for a skipped test: a level or proof-revert run whose output matches it fails as `GATE-SKIP`, quoting the line (M5 pilot 1: a database test skipped and passed). The reference workflows likewise run one owner-approved verification command per unit, requiring a pass.
- **Log:** a refused merge keeps the last lines of each failed command in `.git/aidlc/gates/U-<n>.log` and names the file.
- **Proof-revert:** when every other check so far passed, the unit's changed paths outside every level's `paths`, the bundle and `.aidlc/` are put back as at the base in the index and the files (added files removed), so a run that checks `git diff` sees a clean tree, and each level whose `paths` hold one of the unit's tagged tests runs again: one that still passes is `GATE-PROOF`. The merge result is then restored. A quick-lane unit skips it, as does no such level, and the merge says so; a level that has a `run` but no `paths` cannot hold a tagged test, so an AC at that level is `GATE-LEVEL` until the unit, or one merged before it, adds the level's `paths` (first migration, where a proof skipped in silence); a test-only diff, or a unit that reports mutations, is proved by them instead ([Back-fill](backfill.md)). The trailer `Proof: <level>, …` records it (`none` when skipped).
- **Quick lane ACs:** a quick unit has no tagged tests and runs only the first level, so each command its ACs name in a code span (`make <target>`, `npm run <target>`, `just <target>`, from `grid.runners`) runs on the merged tree; a failure is `GATE-AC`. A claim with no run behind it counts for nothing.
- **Checks:** `check` of every module whose `paths` the diff touches, then `security.check` and `architecture.checks`, run in the merged tree. Commands come from the owner's profile and run through the shell; git never does.
- **Review:** the last `general` verdict is `pass`, for the current diff hash and card hash, and newer than the builder's last report, as `next` counts it (first migration: a report with new mutations merged on verdicts that never saw them). Each focus whose globs the diff touches, and `security` when an added line matches `security.content`, needs its own `pass`, for the current diff or kept ([Review rounds](review-rounds.md)). A verdict file's `focus` defaults to `general`.
- **Architecture:** no denied edge of `architecture.graph` and every `architecture.checks` command passing, read from the merged tree, so the unit that adds a boundary is checked against it ([Requirements and architecture checks](architecture.md#architecture-rules)).

# push and fix
What `aidlc push` checks and what `aidlc fix` writes: [Everyday paths](paths.md).

# check --ci
The CI history check, architecture on the checked-out tree and the job summary: [CI check](ci-check.md).

: Reference AI-DLC workflows
