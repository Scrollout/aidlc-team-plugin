---
type: Design
title: Hook checks
description: What each hook checks or records - guard, scope, secrets, model, docs, heartbeat, steer, prompt, status and denied.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T11:46:55Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Checks
How the hooks are wired, fail and escalate: [Hook mechanics](hooks.md).
- **guard** (Bash, `CronCreate`, `ScheduleWakeup`) reads each command segment as argv, up to a `#` comment and without redirect targets. On `CronCreate` and `ScheduleWakeup`, and for `claude -p`/`--print`, it denies a prompt the prompt hook would take as the owner's approval or go. In the project's repository ([others](hooks.md#wiring)) it denies on Bash, a long option also by prefix:
  - a force push or `+refspec`;
  - pushing, deleting or moving the base, so `aidlc push` is the only way: `--all`, `--mirror`, a glob refspec, a bare push while `remote.*.push` or `push.default=matching` is set, `update-ref`, `branch -f`, `checkout -B`;
  - `--no-verify` or `-n` on a commit;
  - a commit on the base whose index, `--all` files or pathspecs hold a file outside the docs bundle, `.aidlc/**` and `init`'s files;
  - `merge` or `pull` of a `bolt/*` branch in any spelling, and on the base `cherry-pick`, `rebase` or `reset` onto one, since `aidlc merge` does it;
  - a git alias set with `-c alias.*` or `git config alias.*`;
  - `aidlc hook <name>` or `hooks/run.mjs`: Claude Code runs the hooks, never the agent;
  - from a subagent, an `aidlc` command outside its role's `hooks.subagentCommands` (`GUARD-SUBAGENT`).

  The owner commands (`hooks.owner`: `approve`, `dispose`, `upgrade`, `delegate`, `mode`, `release`, `rollback`) it asks the owner about, and records the prompt ([Approvals](approvals.md#owner-prompts)). In `bypassPermissions` mode it denies them ([0009](../decisions/0009-owner-commands-by-permission-prompt.md)). Only `approve --auto` passes, for what the owner delegated ([0008](../decisions/0008-delegated-approvals.md)); the other owner commands refuse an unknown flag. A go the owner typed (below) passes once without a prompt ([Deployment and Operation](operations.md#details)).

  The CLI is any word ending in `aidlc` or `aidlc.mjs`, a Windows path too.
  `git tag` and `gh release` ask the owner, and so does a push that can publish a tag: `--tags`, `--follow-tags` or `push.followTags`, a `refs/tags/` spec, or a spec naming an existing tag (a `v*` tag push can publish a release). Pipes and `; echo $?` pass.
- **scope** (Edit, Write, MultiEdit, NotebookEdit): in a `bolt/*` worktree, a path outside the worktree, outside the scope on the bolt's card or merge-written is denied; the system temp folder is allowed, so a builder writes its report there and passes it to `aidlc report` (worktree isolation refuses pipes and heredocs). From any worktree, a write under `.git/aidlc` (`SCOPE-STATE`), to the main checkout's personal profile, or that changes a doc's `verified` entries or its `verified_hash` is denied.
- **secrets** (Edit, Write, MultiEdit, NotebookEdit): new content, a notebook cell included, matching a built-in secret pattern or one in `profile.security.secrets` is denied. Patterns are data: a project adds one without code.
- **`model`** (Agent): a builder or reviewer (`:builder`, `:reviewer`) names its bolt `B-<n>`, a reviewer maybe an intent `I-<n>`, and passes the card's `model` or `models.review`; a researcher names its doc and passes `models.research`. It renders the card or brief and makes it the prompt (the lead's first line kept when it names the bolt), sets `efforts.<role>`, and touches the heartbeat, `reviewing` or `researching` marker, so `next` waits from launch ([Intake](intake.md#agents-get-exactly-their-brief)).
- **docs** (PostToolUse on a docs bundle file) returns its OKF errors as a block reason. Outside a `bolt/*` worktree it also regenerates the indexes. A `generated.at` more than `okf.stampSkew` seconds from UTC now (a local time marked `Z`) is rewritten to the current UTC second, and the agent told to re-read it.
- **heartbeat** (PreToolUse and PostToolUse) keeps the in-flight mark of the builder, reviewer or researcher fresh, and after a call marks an owner prompt the guard recorded as `ran` ([Agents in flight](in-flight.md), [Approvals](approvals.md#owner-prompts)).
- **steer** (Stop) blocks with `next`'s line when the action is autonomous. It lets the stop through:
  - at a human gate, or while builders run;
  - when `stop_hook_active` is true;
  - when a line of the last message ends with a question mark (a question followed by its options counts);
  - when `next`'s action is the stopping point the owner set with `aidlc mode --stop`.
- **prompt** (UserPromptSubmit) reads the prompt with a trailing `.` or `!` dropped, in any case.[^cc-hooks]
  - Exactly `approve <doc>…`: it runs `approve` as the owner before the lead reads it, and passes on what it stamped, or the error, as `additionalContext` ([0011](../decisions/0011-plain-word-approval.md), [0015](../decisions/0015-one-way-doors-are-approved-one-at-a.md)).
  - Exactly `release I-<n>` or `rollback I-<n>`: it records the owner's go for that command at the current commit in `.git/aidlc/goes.json` and tells the lead to run it; the guard uses the go up on that one call. The hook does not run it: a deploy outlasts its time limit.
  - Any other prompt passes unchanged.
- **status** (SessionStart) returns `aidlc status` and one resume line, at most 1,000 chars: run mode and last owner prompt first.
- **denied** (PermissionDenied, Bash) records a command auto mode refused, with the commit `HEAD` was on, in `.git/aidlc/host-denied.json` (the last five).[^cc-hooks] While `HEAD` stays there, `next` hands that action to the owner ([State](state.md#next)), so steer lets the stop through.

What the guard leaves to the gate or to the owner: [Guard limits](guard-limits.md).
