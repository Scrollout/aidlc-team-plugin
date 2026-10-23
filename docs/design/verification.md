---
type: Design
title: Verification
description: The inner loop (hooks), the merge gate, the reviewer's output contract and the CI mode.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T18:15:00Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Inner loop: hooks
All hooks are thin wrappers in the plugin's `hooks/hooks.json`, run in exec form with `${CLAUDE_PLUGIN_ROOT}`, that call the vendored CLI.[^cc-hooks]

Failure handling, per the hooks reference:[^cc-hooks]
- By default a hook that cannot start, exits with a code other than 0 or 2, times out or prints invalid JSON is a non-blocking error: the action goes ahead (fail open). A wrapper alone cannot catch a missing `node` or a timeout.
- Every blocking hook (guard, scope, secrets, model) therefore sets `"onFailure": "block"` (Claude Code v2.1.295+) and an explicit `timeout` of 10 seconds, not the 600-second default. `aidlc init` and `aidlc status` warn when the installed Claude Code is older.
- Decisions are returned with exit 0 and JSON: `hookSpecificOutput.permissionDecision: "deny"` with a reason for PreToolUse; top-level `decision: "block"` with `reason` for Stop.
- `onFailure` has no effect on Stop hooks, so `steer` is advisory by design: if it fails, the lead simply stops.
- Matching hooks run in parallel, so no hook depends on another's result.
- Each hook's rule is a pure decision function in the CLI ([0006](../decisions/0006-engine-behind-adapters.md)); the hook only adapts the event JSON. A remote setup can call the same functions through an `http` or `mcp_tool` hook.[^cc-hooks]

Facts from the hooks reference this design relies on:[^cc-hooks]
- Hooks fire for subagents' tool calls too; the input carries `agent_id`, `agent_type` and `cwd` (which follows the worktree), so the scope hook knows which builder and which unit it is judging.
- The subagent tool is matched as `Agent`; its `tool_input` has `subagent_type` and `model`, which the model-routing check compares with the card.
- SessionStart `source` is `startup`, `resume`, `clear`, `compact` or `fork`; context is returned as `additionalContext`.
- PreToolUse runs only for Claude's tool calls, so an owner's `!` command is not subject to the guard.
| Hook | Event | Blocks |
|---|---|---|
| guard | PreToolUse Bash | force push; `--no-verify` / `-n` on commit; `aidlc approve`; raw `git merge` of a `unit/*` branch into base; deleting the base |
| scope | PreToolUse Edit/Write | in a `unit/*` worktree: writes outside the card's scope; anywhere: an edit adding or changing a `human:` `verified` entry or `verified_hash` |
| docs | PostToolUse Edit/Write under the bundle | returns OKF errors for the edited file so the agent fixes them at once |
| secrets | PreToolUse Edit/Write | content matching secret patterns (keys, tokens, private keys); `profile.security.secrets` adds patterns |
| steer | Stop | ends of turn while `next` has an autonomous action and no human gate is pending (see [Steering](steering.md)) |
| model | PreToolUse Agent | a builder or reviewer started with a `model` other than the card's |
| status | SessionStart (startup, resume, clear, compact, fork) | nothing; injects `aidlc status` and the resume line (≤ 1,000 chars) |
| heartbeat | PreToolUse and PostToolUse, in a `unit/*` worktree | nothing; touches the unit's heartbeat file |

The guard matches a short deny list on parsed argv; it does not try to model the shell. Details: [Hook mechanics](hooks.md).

# Merge gate: `aidlc merge U-<n>`
Fails with one line per problem, each naming the fix, unless all hold:
1. Unit approved and not stale; deps merged.
2. Diff inside the card's scope; lane at merge ≥ lane at start.
3. Every AC has a test tagged `U-<n>/AC-<k>` in the diff or the base, at its level; not in the quick lane ([Unit card](unit-card.md#quick-lane)).
4. Profile checks for the touched modules and every level `run` pass on the merged result; with the unit's code reverted, each level of its tagged tests fails (proof-revert).
5. Outside the quick lane, verdict `pass` for the current diff hash, plus each required specialist (a focus is required when its globs match the diff).
6. Bundle passes OKF validation.
7. Profile `security.check` commands pass when set (e.g. secret scan, SAST, dependency audit such as gitleaks, semgrep, govulncheck); the plugin runs them, it does not ship them.
8. Architecture: no denied dependency edge and every `architecture.checks` command passes, on every merge ([Architecture](architecture.md)).
On success: `git merge --no-ff` with trailers `Unit: U-<n>`, `Card: <hash>`, `Review: pass`. How it runs: [Merge mechanics](gate.md).

# Reviewer contract
Returns JSON only: `{verdict: pass|fix|escalate, focus?, findings: [{path, line, ac?, claim, scenario, confidence: CONFIRMED|PLAUSIBLE}]}`, at most 10 findings. `review record` may record another verdict than the one sent, and tells the reviewer why ([Review rounds](review-rounds.md)). The reviewer reads tests first.

How a review runs, and why there is no separate architecture focus: [Skill and agents](prompts.md#review).

# CI mode
`aidlc check --ci` runs OKF validation, plan lint and, for each merge commit on the base, its trailers and scope. It needs only Node and the vendored CLI. The owner audits 1 merged unit in 10.

# Prompt evals
Prompts are code coupled to a model version. `tests/evals/` holds a fixture project with seeded defects (an AC without a real test, an out-of-scope edit, an injection, a missing authz check). The reviewer must find each one; the builder must stop on the interface-change fixture. Run before every release and on every model change; a miss blocks the release.

# Later
- Security content patterns, cut from M1 (owner, 2026-10-22).
- Later: an optional CI evaluator agent on pushes.

[^cc-hooks]: Claude Code hooks reference
