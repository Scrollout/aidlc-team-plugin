---
type: Decision
title: 0009 Owner commands by permission prompt
description: The owner runs owner commands (approve, upgrade, delegate, mode, release, rollback) by answering a yes/no permission prompt that the guard raises when the lead runs them, so they work from the mobile app and the web, where ! commands do not run.
status: accepted
decision-makers: the owner
date: 2026-10-22
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T13:01:46Z }
sources:
  - id: cc-rc
    resource: https://code.claude.com/docs/en/remote-control
    title: Remote Control
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Owner commands by permission prompt

## Context and Problem Statement
Owner commands (`approve`, `upgrade`, writing the delegation setting) were `!` commands, which run outside the agent. From the Claude mobile app or the web, a line starting with `!` goes to Claude as a message and does not run in shell mode,[^cc-rc] so an owner on a phone could do none of them.

## Considered Options
1. Keep `!` only: no approvals away from the terminal.
2. An `AskUserQuestion` popup, after which the lead runs `approve`: the lead could run it without asking, so nothing enforces the owner's answer.
3. **The guard answers `ask` for the owner commands**: Claude Code shows the owner a permission prompt for that exact command, and only the owner can allow it.

## Decision Outcome
Option 3.
- The owner commands are those in `cli.json` `hooks.owner`:
  - `approve` (without `--auto`) stamps docs as the owner's;
  - `upgrade` replaces the vendored CLI;
  - `delegate <class>…|off` writes `approvals.auto` in the personal profile;
  - `mode` sets the run mode in the personal profile;
  - `dispose` records the owner's verdict on a security finding;
  - `release I-<n>` and `rollback I-<n>` run the deploy steps (M6, [Deployment and Operation](../design/operations.md)); the owner can also give them by a typed go ([0012](0012-typed-go-for-release-and-rollback.md)).

  The lead runs them when `next` or the owner names them; the guard returns `permissionDecision: "ask"` with the command in the reason, so the owner sees a yes/no prompt.
- A hook's `ask` forces a prompt even in auto mode; the classifier can deny but never approve silently.[^cc-hooks] Remote Control keeps permission prompts open until they are answered, and can push a notification for them.[^cc-rc]
- In `bypassPermissions` mode no prompt is guaranteed, so the guard still denies there; the owner uses `!` in a terminal.
- The stamp stays `human:<git user.email>`: the owner's answer is the approval. `!` keeps working.
- Auto mode's classifier may still refuse a command it reads as self-modification, such as `upgrade`; then the owner uses `!` in a terminal.

Principle 5 needs the decision to be the owner's, not a particular keyboard. A permission prompt is answered only by a person and works on every surface; a chat answer the lead relays is not enforced.

[^cc-rc]: Remote Control
[^cc-hooks]: Claude Code hooks reference
