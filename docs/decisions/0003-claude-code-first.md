---
type: Decision
title: 0003 Claude Code first
description: Ship as a Claude Code plugin first; keep AGENTS.md and the CLI portable so other agent hosts can follow later.
status: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Claude Code first

## Decision Outcome
Claude Code first, chosen by the owner on 2026-10-22.

Claude Code has the hooks (PreToolUse, PostToolUse, SessionStart) and worktree subagents the design relies on. Keeping the rules in the CLI means another host loses only the in-the-moment hooks; CI mode and the merge gate still hold.

### Consequences
- AGENTS.md is the primary instruction file; CLAUDE.md is one line, `@AGENTS.md`.
- No Claude-specific syntax in AGENTS.md or in rendered docs.
