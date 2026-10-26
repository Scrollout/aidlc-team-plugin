---
type: Decision
title: 0011 Plain-word approval
description: The owner approves by typing exactly approve <doc>… as a prompt; a UserPromptSubmit hook stamps the docs before the lead sees the prompt, so approving needs no ! command, no path and no prompt the lead must raise.
status: superseded
superseded_by: "0015"
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T11:20:00Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Context
In the [M2 re-pilot](../pilot/m2-repilot-interventions.md) an escalation reached the owner with no command named, and the lead offered `! node .aidlc/bin/aidlc.mjs approve U-22`. The owner drives the pilot from the mobile app, where `!` does not run; the permission prompt of [0009](0009-owner-commands-by-permission-prompt.md) works there, but only once the lead runs the command, and the owner has to read a script path to approve.

# Options
1. Keep 0009 only, and make every message name the prompt path.
2. **A UserPromptSubmit hook**: a prompt that is exactly `approve <doc>…` runs the approval itself.
3. A plugin slash command (`/approve U-22`): its shell step goes through the permission system and the guard, so it is the lead's tool call again.

# Decision
Option 2, chosen by the owner on 2026-10-23. 0009 stays for the other owner commands and as a second path.
- The hook reads the `prompt` field and acts only when the whole prompt, trimmed, is `approve` followed by doc ids or paths. Pasted text arrives wrapped in its own lines and a message from another session arrives wrapped too, so neither matches.[^cc-hooks]
- It runs `approve` as the owner, `human:<git user.email>`, and passes the prompt on with `additionalContext` naming what it stamped, or the error. The lead commits the stamps and continues with `next`; it never runs `approve` for that prompt.[^cc-hooks]
- UserPromptSubmit also fires for a session-scoped scheduled task or loop.[^cc-hooks] The guard therefore denies a `CronCreate` or `ScheduleWakeup` whose prompt matches, so the lead cannot schedule its own approval.
- A project whose pinned CLI predates the hook is not blocked: on that event a failed run passes the prompt with no context.
- Messages name the words to type (`approve U-22`); none offers `!`.

# Why
Principle 5 needs the approval to be the owner's act. Text the owner types is the one input the lead cannot produce in its own turn; the hook acts on it before the lead does, on every surface, with nothing to read but the ids.

[^cc-hooks]: Claude Code hooks reference
