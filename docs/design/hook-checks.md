---
type: Design
title: Hook checks
description: What each hook checks or records - guard, scope, secrets, model, docs, heartbeat, steer, prompt, status and denied.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T10:28:02Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Checks
How the hooks are wired, fail and escalate: [Hook mechanics](hooks.md).
- **guard** (Bash, `CronCreate`, `ScheduleWakeup`) reads each command segment as argv. On `CronCreate` and `ScheduleWakeup` it denies a prompt the prompt hook would take as the owner's approval or go (`release I-<n>`, `rollback I-<n>`). On Bash it denies:
  - a force push or `+refspec`;
  - pushing or deleting the base, so `aidlc push` is the only way;
  - `--no-verify` or `-n` on a commit;
  - a commit on the base that stages files outside the bundle, `.aidlc/**` and the files `init` writes;
  - `git merge` of a `unit/*` branch, since `aidlc merge` does it.

  The owner commands (`hooks.owner`: `approve`, `upgrade`, `delegate`, `mode`, `release`, `rollback`) in any spelling it does not deny but asks the owner, and records the prompt ([Approvals](approvals.md#owner-prompts)): a yes/no prompt on any device. In `bypassPermissions` mode it denies them ([0009](../decisions/0009-approval-prompt.md)). A command with `--auto` passes, for what the owner delegated ([0008](../decisions/0008-delegated-approvals.md)). A `release I-<n>` or `rollback I-<n>` the owner typed at the current commit passes once without a prompt ([Deployment and operation](operations.md#details)).

  `git tag` and `gh release` ask the owner. Redirects, pipes and `; echo $?` pass: the guard reads argv, not the shell. The pilot's refusals of `.github/scripts/x.sh > out; echo $?` came from Claude Code's worktree isolation, which refuses a compound command that names git and reads `.github` as git.
- **scope** (Edit, Write): in a `unit/*` worktree, a path outside the scope on the unit's card (the approved doc at the base) or a merge-written file is denied. Anywhere, a write that changes a doc's `verified` events or its `verified_hash`, or the personal profile, is denied.
- **secrets** (Edit, Write): new content matching a built-in secret pattern or one in `profile.security.secrets` is denied. Pattern lists sit in data, not in rules prose, so a project adds one without editing code.
- **model** (Agent): a builder or reviewer (`subagent_type` ending in `:builder` or `:reviewer`) must name its unit `U-<n>` in the prompt and pass `model` equal to the card's (builder) or `models.review` (reviewer). It touches the unit's heartbeat (builder) or `reviewing` marker (reviewer) at launch, so `next` waits for an agent from its start. A researcher must pass `models.research`; its brief's first line names the doc, whose `researching` marker it touches.
- **docs** (PostToolUse on a bundle file) returns that file's OKF errors as a block reason so the agent fixes them at once. Outside a `unit/*` worktree it also regenerates the indexes. When the edit wrote a `generated.at` more than `okf.stampSkew` seconds from the current UTC time (a local time marked `Z`), it rewrites the stamp to the current UTC second and tells the agent to re-read the file.
- **heartbeat** (PreToolUse and PostToolUse) keeps the mark of the builder, reviewer or researcher in flight fresh, and after a call marks an owner prompt the guard recorded as `ran` ([Agents in flight](in-flight.md), [Approvals](approvals.md#owner-prompts)).
- **steer** (Stop) blocks with `next`'s line when the action is autonomous. It lets the stop through:
  - at a human gate, or while builders run;
  - when `stop_hook_active` is true;
  - when a line of the last message ends with a question mark, so a question followed by its options counts;
  - when `next`'s action is the stopping point the owner set with `aidlc mode --stop`.
- **prompt** (UserPromptSubmit) reads the prompt with a trailing `.` or `!` dropped, in any case.[^cc-hooks]
  - Exactly `approve <doc>…`: it runs `approve` as the owner before the lead reads it, and passes the prompt on with what it stamped or the error as `additionalContext` ([0011](../decisions/0011-plain-word-approval.md)).
  - Exactly `release I-<n>` or `rollback I-<n>`: it records the owner's go for that command at the current commit in `.git/aidlc/goes.json` and tells the lead to run it; the guard uses the go up on that one call. A deploy outlasts the hook's time limit, so the hook does not run it.
  - Any other prompt passes unchanged.
- **status** (SessionStart) returns `aidlc status` and one resume line, at most 1,000 chars: the run mode and the last owner prompt come first.
- **denied** (PermissionDenied, Bash) records a command auto mode refused, with the commit `HEAD` was on, in `.git/aidlc/host-denied.json` (the last five).[^cc-hooks] While `HEAD` stays there, `next` hands that action to the owner instead of demanding it again ([State](state.md#next)), so steer lets the stop through.

[^cc-hooks]: Claude Code hooks reference
