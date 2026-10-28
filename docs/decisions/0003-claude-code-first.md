---
type: Decision
title: 0003 Claude Code first
description: Ship as a Claude Code plugin first; keep AGENTS.md and the CLI portable so other agent hosts can follow later.
status: accepted
date: 2026-10-22
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Claude Code first

## Context and Problem Statement
The design relies on hooks around each tool call and on subagents in their own worktrees. Agent hosts differ in both. Which host does the plugin ship for first, and how does it stay portable?

## Decision Drivers
* The hooks and worktree subagents the design relies on.
* The rules hold on any host: what the CLI and CI enforce does not depend on the host.

## Considered Options
* **Ship for Claude Code first, the rules in the CLI.**
* Ship for several hosts at once.

## Decision Outcome
Chosen option: "Ship for Claude Code first, the rules in the CLI", because Claude Code has the hooks (PreToolUse, PostToolUse, SessionStart) and the worktree subagents the design relies on, and with the rules in the CLI another host loses only the in-the-moment hooks: CI mode and the merge gate still hold.

### Consequences
* Good, because AGENTS.md is the primary instruction file; CLAUDE.md is one line, `@AGENTS.md`.
* Good, because AGENTS.md and the rendered docs hold no host-specific syntax.
* Bad, because a host without hooks catches a broken rule at the gate, not as it is written.
