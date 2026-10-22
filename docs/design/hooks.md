---
type: Design
title: Hook mechanics
description: How the plugin's hooks reach the pinned CLI, what each one checks, and how repeated denials escalate.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T12:20:00Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Wiring
- `plugin/hooks/hooks.json` runs `node ${CLAUDE_PLUGIN_ROOT}/hooks/run.mjs <name>` in exec form.[^cc-hooks] The wrapper finds the project from the hook input's `cwd` (the folder holding `.aidlc/profile.json`) and runs `node .aidlc/bin/aidlc.mjs hook <name>` there, so the project's pinned CLI judges it.
- A folder without `.aidlc/profile.json` is not managed: every hook allows. A managed project whose pinned CLI is missing gets a deny from every blocking hook.
- Blocking hooks (guard, scope, secrets, model) set `timeout: 10` and `onFailure: "block"`; a hook that cannot run denies. Each prints JSON and exits 0: `permissionDecision: "deny"` with `CODE message → fix` as the reason.

# Checks
- **guard** (Bash) reads each command segment as argv. It denies:
  - a force push or `+refspec`;
  - pushing or deleting the base, so `aidlc push` is the only way;
  - `--no-verify` or `-n` on a commit;
  - a commit on the base that stages files outside the bundle, `.aidlc/**` and the files `init` writes;
  - `git merge` of a `unit/*` branch, since `aidlc merge` does it;
  - `aidlc approve` in any spelling, except `--auto` for what the owner delegated ([0008](../decisions/0008-delegated-approvals.md)).

  `git tag` and `gh release` ask the owner.
- **scope** (Edit, Write): in a `unit/*` worktree, a path outside the unit's scope or a merge-written file is denied. Anywhere, a write that changes a doc's `verified` events or its `verified_hash`, or the personal profile, is denied.
- **secrets** (Edit, Write): new content matching a built-in secret pattern or one in `profile.security.secrets` is denied. Pattern lists sit in data, not in rules prose, so a project adds one without editing code.
- **model** (Agent): a builder or reviewer (`subagent_type` ending in `:builder` or `:reviewer`) must name its unit `U-<n>` in the prompt and pass `model` equal to the card's (builder) or `models.review` (reviewer).
- **docs** (PostToolUse on a bundle file) returns that file's OKF errors as a block reason so the agent fixes them at once. Outside a `unit/*` worktree it also regenerates the indexes.
- **heartbeat** (PostToolUse, `unit/*` worktree) touches `.git/aidlc/heartbeats/U-<n>`.
- **steer** (Stop) blocks with `next`'s line when the action is autonomous. It lets the stop through:
  - at a human gate, or while builders run;
  - when `stop_hook_active` is true;
  - when a line of the last message ends with a question mark, so a question followed by its options counts.
- **status** (SessionStart) returns `aidlc status` and one resume line, at most 1,000 chars.

# Escalation
Denials are counted per session, code and target in `.git/aidlc/denials.json`; `steer` clears the session's counts at the end of each turn. The third identical denial in a turn says `escalate`: stop and tell the owner.

[^cc-hooks]: Claude Code hooks reference
