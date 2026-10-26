---
type: Design
title: Hook mechanics
description: How the plugin's hooks reach the pinned CLI, how they fail, the host facts they rely on, and how repeated denials escalate.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T11:46:55Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Wiring
- `plugin/hooks/hooks.json` runs `node ${CLAUDE_PLUGIN_ROOT}/hooks/run.mjs <name>` in exec form.[^cc-hooks] The wrapper finds the project from the hook input's `cwd` (the folder holding `.aidlc/profile.json`) and runs `node .aidlc/bin/aidlc.mjs hook <name>` there, so the project's pinned CLI judges it. A `cwd` outside any work tree, such as `.git/aidlc`, is judged from the project folder, so a session that wandered there can still `cd` out.
- A folder without `.aidlc/profile.json` is not managed: every hook allows. A managed project whose pinned CLI is missing gets a deny from every PreToolUse hook, naming the command the owner runs in a terminal to restore it from the plugin (a hook cannot judge it, and the lead cannot run it past the guard). The other hooks let the event pass, so the Stop hook cannot block every turn end, and a failed prompt hook (an older pinned CLI) passes the prompt unchanged.
- **Other repositories:** the guard judges a git call in the folder its `cd` segments and `-C` options lead to, from the input's `cwd`, a leading `~` expanded as the shell does. A repository there that is not the project (its own common git dir, no `.aidlc/profile.json`, no remote URL, path or pushed-to URL shared with the project, URLs compared without scheme, user and `.git`) gets no git check; any folder it cannot resolve is judged as the project (first migration: a push of an infra repo's `main` was refused as a raw push of the base). A `cd` stays unresolved only when its own effect may be lost: the command has a subshell, or the `cd` sits in a pipeline or a background job (`cd x | …`, `… | cd x`, `cd x & …`). A pipe or `||` elsewhere keeps it, as bash runs those after the `cd` in its folder (second project: `cd ~/infra && git push origin main 2>&1 | tail` was refused).
- A blocking hook that cannot run denies. Each prints JSON and exits 0: `permissionDecision: "deny"` (or `"ask"` for an owner command) with `CODE message → fix` as the reason; on a CLI error the wrapper exits 2, which blocks, except for the prompt and heartbeat hooks, which pass.

# Failure handling
Per the hooks reference:[^cc-hooks]
- By default a hook that cannot start, exits with a code other than 0 or 2, times out or prints invalid JSON is a non-blocking error: the action goes ahead (fail open). A wrapper alone cannot catch a missing `node` or a timeout.
- Every blocking hook (guard, scope, secrets, model) therefore sets `"onFailure": "block"` (Claude Code v2.1.295+) and an explicit `timeout` of 10 seconds, not the 600-second default.
- Decisions are returned with exit 0 and JSON: `hookSpecificOutput.permissionDecision: "deny"` with a reason for PreToolUse; top-level `decision: "block"` with `reason` for Stop.
- `onFailure` has no effect on Stop hooks, so `steer` is advisory by design: if it fails, the lead simply stops.
- Matching hooks run in parallel, so no hook depends on another's result.
- Each hook's rule is a pure decision function in the CLI ([0006](../decisions/0006-engine-behind-adapters.md)); the hook only adapts the event JSON. A remote setup can call the same functions through an `http` or `mcp_tool` hook.

# Host facts
From the hooks reference:[^cc-hooks]
- Hooks fire for subagents' tool calls too; the input carries `agent_id`, `agent_type` and `cwd` (which follows the worktree), so the scope hook knows which builder and which unit it is judging.
- The subagent tool is matched as `Agent`; its `tool_input` has `subagent_type` and `model`, which the model hook compares with the card.
- SessionStart `source` is `startup`, `resume`, `clear`, `compact` or `fork`; context is returned as `additionalContext`.
- PreToolUse runs only for Claude's tool calls, so an owner's `!` command is not subject to the guard.
- Claude Code's worktree isolation refuses a compound command that names git and reads `.github` as git: the pilot's refusals of `.github/scripts/x.sh > out; echo $?` came from it, not from the guard.

What each hook checks: [Hook checks](hook-checks.md).

# Escalation
Denials are counted per session, code and target in `.git/aidlc/denials.json`; `steer` clears the session's counts at the end of each turn. The third identical denial in a turn says `escalate`: stop and tell the owner.

[^cc-hooks]: Claude Code hooks reference
