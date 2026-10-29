---
type: Design
title: Merge mechanics
description: How aidlc merge and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, test runs, proof-revert and the CI history check.
status: stable

generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T11:46:55Z }
---

# Trial merge
`aidlc merge B-<n>` runs in the lead's checkout on the base:
1. A temporary worktree at the base tip merges `bolt/B-<n>` with `--no-ff --no-commit`. A conflict fails with `GATE-CONFLICT`: the builder merges the base into its branch and reports again.
2. The docs bundle indexes and log, `profile.regen` commands for `profile.shared` files, and the [codebase map](codebase-map.md) are updated there and staged first, so every condition of [Verification](verification.md) then runs on the tree the merge will commit: a docs check that wants each doc in its index passes for a bolt that adds a doc.
3. Only when all pass, the merge is committed with five trailers (`Unit`, `Card`, `Review`, `Tested`, `Proof`) and the base fast-forwards to it; a base that moved meanwhile refuses the merge (`GATE-MOVED`), never half merging. The bolt's worktree and branch are then removed: a worktree whose tracked files are clean goes even when the host locked it, one with uncommitted tracked changes is kept and named.
- One merge at a time: its lock names the bolt and process; another is refused while it holds (`GATE-BUSY`); a lock whose process is gone is taken over.
Nothing touches the base until every check passes, so a failed gate leaves no half merge.

# Codes
Every code the gate can refuse with, and its fix: [Gate codes](tables/codes-gate.md), generated from `cli.json`. Level runs add `gate.fresh` (no test cache). A builder launched after a refusal is a fix round.

# Details
- **Order:** the checks below run as the stages of `gate.stages`, in order; a project adds stages of its own ([Lifecycle as data](lifecycle.md#gate-stages-and-review-focuses)).
- **Scope:** every path in the bolt's diff matches its scope. A builder's diff touching a file merge writes (an `index.md` or `log.md`, a codebase map page under its v1 or v2 name, a trace, the glossary, the context map, a `profile.shared` glob) is `GATE-SHARED`. The history check in `push` and `check --ci` admits those in a merge commit, and judges a merge by its card as committed, found by ID after a rename.
- **Secrets:** no line the bolt's diff adds matches a secret pattern of the secrets hook (`GATE-SECRET`), so one written from Bash, which that hook never sees, stops the merge.
- **Lane:** the lane of the diff's paths must not exceed the card's lane.
- **AC tests:** a file in the merged tree, outside the docs bundle, contains `B-<n>/AC-<k>` for each AC. With `profile.levels.<level>.paths` set, the file must match them, read from the merged tree's profile: a bolt whose scope holds the profile can add a test location, and its reviewers see that change.
- **Test runs:** every `profile.levels.<level>.run`, from the merged tree's profile, runs there in full, a quick-lane bolt's first level only. A failure is `GATE-RUN`, or `GATE-BASE` when the level fails on the base alone too: the base is red ([Base CI](base-ci.md)). The merge records them in a `Tested: <level>, …` trailer (`none`: none ran). A level's `needs` lists the environment variables its run requires: one unset fails it as `GATE-RUN` before it runs. A level's `skip` is the pattern its runner prints for a skipped test: a level or proof-revert run whose output matches it fails as `GATE-SKIP`, quoting the line: a skipped test must not count as passed.
- **Log:** a refused merge keeps the last lines of each failed command in `.git/aidlc/gates/B-<n>.log` and names the file.
- **Proof-revert:** when every other check so far passed, the bolt's changed paths outside every level's `paths`, the docs bundle and `.aidlc/` are put back as at the base in the index and the files (added files removed), and each level whose `paths` hold one of the bolt's tagged tests runs again: one that still passes is `GATE-PROOF`. The merge result is restored. A quick-lane bolt skips it, as does no such level, and the merge says so; a level with a `run` but no `paths` cannot hold a tagged test, so an AC there is `GATE-LEVEL` until a bolt adds the level's `paths`; a test-only diff, or a bolt that reports mutations, is proved by them instead ([Back-fill](backfill.md)). The trailer `Proof: <level>, …` records it (`none` when skipped).
- **Quick lane ACs:** a quick bolt has no tagged tests and runs only the first level, so each command its ACs name in a code span (`make <target>`, `npm run <target>`, `just <target>`, from `grid.runners`) runs on the merged tree; a failure is `GATE-AC`. A claim with no run behind it counts for nothing.
- **Checks:** `check` of every module whose `paths` the diff touches, then `security.check` and `architecture.checks`, run in the merged tree. Commands come from the owner's profile and run through the shell; git never does.
- **Review:** the last `general` verdict is `pass`, for the current diff hash and card hash, and newer than the builder's last report, as `next` counts it, so a report with new mutations never merges on verdicts that did not see them. Each focus whose globs the diff touches, and `security` when an added line matches `security.content`, needs its own `pass`, for the current diff or kept ([Review rounds](review-rounds.md)). A verdict file's `focus` defaults to `general`.
- **Architecture:** no denied edge of `architecture.graph` and every `architecture.checks` command passing, read from the merged tree, so the bolt that adds a boundary is checked against it ([Requirements and architecture checks](architecture.md#architecture-rules)).

# push and fix
What `aidlc push` checks and what `aidlc fix` writes: [Everyday paths](paths.md).

# check --ci
The CI history check, architecture on the checked-out tree and the job summary: [CI check](ci-check.md).

: Reference AI-DLC workflows
