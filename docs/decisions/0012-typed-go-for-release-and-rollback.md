---
type: Decision
title: 0012 Typed go for release and rollback
description: The owner releases or rolls back by typing exactly release I-<n> or rollback I-<n>; the prompt hook records a go for that command at the current commit, and the guard lets the lead's one matching call through and uses the go up, since a deploy outlasts the hook's time limit.
status: proposed
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T14:00:00Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Typed go for release and rollback

## Context and Problem Statement
`release` and `rollback` are owner commands ([0009](0009-owner-commands-by-permission-prompt.md), [Deployment and operation](../design/operations.md)). [0011](0011-plain-word-approval.md) lets the owner approve by typing the words, and the prompt hook runs the approval itself. A release cannot work that way: it runs `deploy.run`, `release` and `deploy.smoke`, which can take minutes, and the plugin sets each hook's timeout to 10 s ([Overview](../design/overview.md) budgets).[^cc-hooks] A hook cut off midway would leave a deploy half run and nothing recorded.

## Considered Options
1. **A typed go, recorded and used once by the guard**: a prompt that is exactly `release I-<n>` or `rollback I-<n>` records the owner's go for that command; the lead runs it, and the guard lets that one call through without a prompt.
2. **The permission prompt only**, as in 0009: the lead runs the command and the owner answers yes; nothing to type, but a prompt to wait for and answer on every release.
3. **The hook runs the command in the background**, past its own timeout: no lead call, but no exit or output reaches the session, and a failed smoke would be found late.

## Decision Outcome
Option 1, chosen by the owner on 2026-10-24 (U48). The permission prompt of option 2 stays the path when no go is recorded.
- The prompt hook matches the whole prompt, trimmed, against `cli.json` `hooks.goWords`; a trailing `.` or `!` is allowed, as an owner ends a sentence. It writes `{ command, head, at }` to `.git/aidlc/goes.json` (the last five) and passes the prompt on with context naming the command for the lead to run.
- The guard allows `aidlc release I-<n>` or `aidlc rollback I-<n>` only when a go for that exact command was recorded at the current `HEAD`, removes it, and counts it in the retro's interventions. A second call, or one after a new commit, gets the permission prompt again. The host's own permission check still applies.
- UserPromptSubmit also fires for a scheduled task or loop,[^cc-hooks] so the guard denies a `CronCreate` or `ScheduleWakeup` whose prompt is a go, as it does an approval (U62): the lead cannot schedule its own release.
- `aidlc release` still refuses without a passing deploy check on the current base, and `next` names the words to type for the release and the rollback.

Principle 5 needs the release to be the owner's act. Typed words are the one input the lead cannot produce in its own turn, as in 0011; recording them and running the command in the lead's turn keeps the full output, the exit code and the deploy record, and a go used once at one commit cannot release later work.

[^cc-hooks]: Claude Code hooks reference
