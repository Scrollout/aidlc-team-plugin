# Design

* [Board](board.md) - An optional one-way projection of derived state onto GitHub issues and a GitHub Project, written by deterministic code at zero model tokens.
* [CLI](cli.md) - The aidlc commands, their exit codes and the terse output format.
* [Everyday paths](paths.md) - Fixes without an intent, changes mid-flight, shared files, pushing and base health, cleanup, adopting an existing project, and removing the plugin.
* [Grid](grid.md) - The AI-DLC rows, the plan-execute-validate loop in each cell, lanes and the doc types each row produces.
* [OKF](okf.md) - How the plugin writes, indexes and validates OKF v0.2 bundles, following the official spec and its reference implementation.
* [Overview](overview.md) - Goals, non-goals, budgets, repo layout and glossary of the plugin.
* [Profile and templates](profile.md) - The project profile, rule layers, the template engine and how the CLI is vendored and pinned.
* [Requirements and architecture checks](architecture.md) - Lasting requirements as their own docs, and architecture rules as checks that fail a merge, so a project cannot drift from its intended shape.
* [State](state.md) - How the CLI derives progress from git and docs, how approvals work, and how next picks the one allowed step.
* [Steering](steering.md) - How the plugin corrects the agent during work, keeps it moving, and improves its rules over time without growing.
* [Team](team.md) - The four roles, how parallel worktree workers are run and merged, and where tokens are spent.
* [Unit card](unit-card.md) - The generated, read-only brief one builder works from and one reviewer checks against.
* [Verification](verification.md) - The inner loop (hooks), the merge gate, the reviewer's output contract and the CI mode.
