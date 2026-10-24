---
type: Design
title: Parallel builders
description: How the lead runs builders side by side in worktrees, what the agents' frontmatter sets for that, and how their units are merged.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T10:28:02Z }
sources:
  - id: cc-worktrees
    resource: https://code.claude.com/docs/en/worktrees
    title: Claude Code worktrees
  - id: cc-subagents
    resource: https://code.claude.com/docs/en/sub-agents
    title: Claude Code subagents
---

# Parallel work
The roles and model routing: [Team](team.md).
- `aidlc next` lists buildable units: approved, deps merged, scopes disjoint from units in flight, up to `parallel.max` (default 3).
- The lead starts one builder per unit in a single message. The builder agent's frontmatter sets `isolation: worktree`; Claude Code creates a temporary worktree under `.claude/worktrees/`, removes it if nothing changed, and keeps one holding work until a sweep finds it safe to remove.[^cc-worktrees] By default the worktree branches from the remote's default branch, so local merges not yet pushed would be invisible; `aidlc init` therefore sets `worktree.baseRef: "head"` in the project's `.claude/settings.json`, so builders branch from the lead's local base.[^cc-worktrees] The builder's first command is `aidlc start U-<n>`, which renames its auto-named branch to `unit/U-<n>` and refuses if the base differs from the card's.
- Builders and reviewers set `omitClaudeMd: true`: the card carries what they need, so they do not pay for the project's AGENTS.md on every run.[^cc-subagents] Worktree subagents read instruction files from the main conversation, not their branch, so unit-specific rules travel in the card, never in a file on the branch.[^cc-worktrees]
- Plugin agents are named `<plugin>:<name>` (e.g. `aidlc-team:builder`); hooks recognise them by `agent_type`.
- Subagents started from the main conversation run in the background by default; the lead waits for their notifications, and heartbeats ([State](state.md)) cover the case where a session ends first.
- Builders and reviewers omit `Agent` from `tools`, so they cannot spawn further subagents (nesting is allowed by default and would multiply cost).[^cc-subagents]
- Plugin agents ignore `hooks` and `permissionMode` in their frontmatter, so all enforcement lives in the plugin's `hooks/hooks.json`.[^cc-subagents]
- The lead merges with `aidlc merge U-<n>` in DAG order. The gate trial-merges the unit branch into the current base and runs every check there; a conflict fails with `GATE-CONFLICT`, and the builder merges the base into its branch ([Merge mechanics](gate.md#trial-merge)).
- A builder that hits a "stop and report" condition returns without code; the lead fixes the spec and restarts it.

[^cc-subagents]: Claude Code subagents
[^cc-worktrees]: Claude Code worktrees
