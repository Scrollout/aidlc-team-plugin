---
type: Design
title: Guard limits
description: What the hooks do not stop, by design - deliberate evasion such as shell wrappers, Bash writes to state files and raw API calls - and what catches each instead.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T11:48:25Z }
---

The guard stops mistakes, not attackers ([Overview](overview.md#non-goals)). Checks: [Hook checks](hook-checks.md).

# What the guard does not stop
These gaps need a deliberate evasion, so they are recorded and left out of scope, not blocked:
- Bash writes outside the scope or to the state files (`sed -i`, `echo >`): the gate's `SCOPE-OUT` and the secret scan of the bolt's added lines are the backstop for code.
- A command the guard cannot read as argv: quoted `bash -c`, `sh -c` or `eval`, variable indirection, `xargs`, a symlinked or copied CLI, `node -e` importing the CLI.
- Raw API calls: `gh api` on refs, `git send-pack`.

[^cc-hooks]: Claude Code hooks reference
