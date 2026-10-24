---
type: Design
title: Hook mechanics
description: How the plugin's hooks reach the pinned CLI, what each one checks, and how repeated denials escalate.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T18:15:00Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Wiring
- `plugin/hooks/hooks.json` runs `node ${CLAUDE_PLUGIN_ROOT}/hooks/run.mjs <name>` in exec form.[^cc-hooks] The wrapper finds the project from the hook input's `cwd` (the folder holding `.aidlc/profile.json`) and runs `node .aidlc/bin/aidlc.mjs hook <name>` there, so the project's pinned CLI judges it. A `cwd` outside any work tree, such as `.git/aidlc`, is judged from the project folder, so a session that wandered there can still `cd` out.
- A folder without `.aidlc/profile.json` is not managed: every hook allows. A managed project whose pinned CLI is missing gets a deny from every PreToolUse hook, naming the command the owner runs in a terminal to restore it from the plugin (a hook cannot judge it, and the lead cannot run it past the guard). The other hooks let the event pass, so the Stop hook cannot block every turn end, and a failed prompt hook (an older pinned CLI) passes the prompt unchanged.
- Blocking hooks (guard, scope, secrets, model) set `timeout: 10` and `onFailure: "block"`; a hook that cannot run denies. Each prints JSON and exits 0: `permissionDecision: "deny"` with `CODE message → fix` as the reason.

# Checks
- **guard** (Bash) reads each command segment as argv. On `CronCreate` and `ScheduleWakeup` it denies a prompt the prompt hook would take as the owner's approval or go (`release I-<n>`, `rollback I-<n>`). On Bash it denies:
  - a force push or `+refspec`;
  - pushing or deleting the base, so `aidlc push` is the only way;
  - `--no-verify` or `-n` on a commit;
  - a commit on the base that stages files outside the bundle, `.aidlc/**` and the files `init` writes;
  - `git merge` of a `unit/*` branch, since `aidlc merge` does it;
  - the owner commands `aidlc approve`, `upgrade`, `delegate` and `mode` in any spelling: it asks the owner instead and records the prompt ([Approvals](approvals.md#owner-prompts)), a yes/no prompt on any device, and denies in `bypassPermissions` mode ([0009](../decisions/0009-approval-prompt.md)); `approve --auto` passes for what the owner delegated ([0008](../decisions/0008-delegated-approvals.md)).

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
- **prompt** (UserPromptSubmit): a prompt that is exactly `approve <doc>…` runs `approve` as the owner before the lead reads it, and passes the prompt on with what it stamped or the error as `additionalContext`; any other prompt passes unchanged ([0011](../decisions/0011-plain-word-approval.md)).[^cc-hooks]
- **status** (SessionStart) returns `aidlc status` and one resume line, at most 1,000 chars: the run mode and the last owner prompt come first.
- **denied** (PermissionDenied, Bash) records a command auto mode refused, with the commit `HEAD` was on, in `.git/aidlc/host-denied.json` (the last five).[^cc-hooks] While `HEAD` stays there, `next` hands that action to the owner instead of demanding it again ([State](state.md#next)), so steer lets the stop through.

# Escalation
Denials are counted per session, code and target in `.git/aidlc/denials.json`; `steer` clears the session's counts at the end of each turn. The third identical denial in a turn says `escalate`: stop and tell the owner.

[^cc-hooks]: Claude Code hooks reference
