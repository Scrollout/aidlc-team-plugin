# Decisions

* [0001 Derived state](0001-derived-state.md) - no ledger or handoff file; state comes from git and docs. Load when touching state.
* [0002 Worktree subagents](0002-worktree-subagents.md) - parallel workers are worktree subagents of one lead session. Load when touching parallelism.
* [0003 Claude Code first](0003-claude-code-first.md) - Claude Code plugin first, AGENTS.md portable. Load when adding another agent host.
* [0004 Vendored CLI](0004-vendored-cli.md) - a zero-dependency Node CLI copied into each project and pinned. Load when touching install or CI.
* [0005 One repo](0005-one-repo.md) - develop and ship from one repo; only `plugin/` is installed. Load when touching packaging.
