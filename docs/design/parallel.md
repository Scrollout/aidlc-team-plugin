---
type: Design
title: Parallel builders
description: How the lead runs builders side by side in worktrees, what the agents' frontmatter sets for that, and how their bolts are merged.
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
- `aidlc next` lists buildable bolts: approved, deps merged, scopes disjoint from every bolt started and not yet merged (built, in review or waiting to merge too), up to `parallel.max` (default 3) in flight. At the same priority a bolt of an intent goes before a fix unit: fix bolts take the free slots.
- `reserves` holds tokens no two bolts in flight may share: a migration number, or an exclusive runtime resource the bolt's tests need (`ci-cluster/port-25`): the declared way to serialise builders on something their scopes do not show, such as parallel e2e runs on one cluster. It covers builders the plugin hands out, not CI or the gate; a shared test target also isolates each run (its own namespaces, a lease on the shared part).
- The lead starts one builder per bolt in a single message. The builder agent's frontmatter sets `isolation: worktree`; Claude Code creates a temporary worktree under `.claude/worktrees/`, removes it if nothing changed, and keeps one holding work until a sweep finds it safe to remove.[^cc-worktrees] By default the worktree branches from the remote's default branch, so local merges not yet pushed would be invisible; `aidlc init` therefore sets `worktree.baseRef: "head"` in the project's `.claude/settings.json`, so builders branch from the lead's local base.[^cc-worktrees] The builder's first command is `aidlc start B-<n>`, which renames its auto-named branch to `bolt/B-<n>` and refuses if the base differs from the card's.
- Builders and reviewers set `omitClaudeMd: true`: the card carries what they need, so they do not pay for the project's AGENTS.md on every run.[^cc-subagents] Worktree subagents read instruction files from the main conversation, not their branch, so bolt-specific rules travel in the card, never in a file on the branch.[^cc-worktrees]
- Plugin agents are named `<plugin>:<name>` (e.g. `aidlc-team:builder`); hooks recognise them by `agent_type`.
- Subagents started from the main conversation run in the background by default; the lead waits for their notifications, and heartbeats ([State](state.md)) cover the case where a session ends first.
- Builders and reviewers omit `Agent` from `tools`, so they cannot spawn further subagents (nesting is allowed by default and would multiply cost).[^cc-subagents]
- Plugin agents ignore `hooks` and `permissionMode` in their frontmatter, so all enforcement lives in the plugin's `hooks/hooks.json`.[^cc-subagents]
- The lead merges with `aidlc merge B-<n>` in DAG order. The gate trial-merges the bolt branch into the current base and runs every check there; a conflict fails with `GATE-CONFLICT`, and the builder merges the base into its branch ([Merge mechanics](gate.md#trial-merge)).
- A builder that hits a "stop and report" condition returns without code; the lead fixes the spec and restarts it.

[^cc-subagents]: Claude Code subagents
[^cc-worktrees]: Claude Code worktrees
