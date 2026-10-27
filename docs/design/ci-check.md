---
type: Design
title: CI check
description: What aidlc check --ci adds in CI - the base history since adoption, architecture on the checked-out tree, and a GitHub Actions job summary the owner reads on the run page.
status: stable
sources:
  - id: gh-summary
    resource: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
    title: GitHub Actions workflow commands, adding a job summary
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T16:00:00Z }
---

# History
After OKF validation and plan lint, every base commit after `profile.adopted` (all of them without it) is a gate merge with the `Unit`, `Card` and `Review` trailers and only in-scope or merge-written files, or a commit touching only allowed direct paths (`CI-MERGE`, `CI-COMMIT`). A merge whose `Bolt` trailer names no bolt in the plan fails, here and in `aidlc push` (`PUSH-COMMIT`). Architecture boundaries and checks run on the checked-out tree. The generated `aidlc` job sets up Node only, so a graph or check command that needs a toolchain fails there until the project adds its setup steps; in CI an `ARCH-CHECK` says so (first migration: Go checks added after `init` turned the base red).

# Job summary
On GitHub Actions (`GITHUB_STEP_SUMMARY` set), `check --ci` also appends a job summary: passed or the error and warning counts, a table of the findings with their fixes (at most `gate.summaryMax` rows, well under GitHub's 1 MiB per step), and each intent and bolt with its state, so the owner reads the result on the run page (owner, 2026-10-24).[^gh-summary]

Parent: [Merge mechanics](gate.md).

[^gh-summary]: GitHub Actions workflow commands, adding a job summary
