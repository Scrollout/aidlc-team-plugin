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
All hooks are thin wrappers in the plugin's `hooks/hooks.json`, run in exec form with `${CLAUDE_PLUGIN_ROOT}`, that call the vendored CLI.[^cc-hooks] How they are wired and fail: [Hook mechanics](hooks.md); what each checks: [Hook checks](hook-checks.md).
| Hook | Event | Blocks or records |
|---|---|---|
| guard | PreToolUse Bash, `CronCreate`, `ScheduleWakeup` | blocks force push; `--no-verify` / `-n` on commit; raw `git merge` of a `unit/*` branch; pushing or deleting the base; a code commit on the base; any commit on the base while `aidlc merge` runs its gate (`.git/aidlc/merging`, two hours at most); a scheduled approval or go. Asks the owner for an owner command, `git tag` and `gh release` |
| scope | PreToolUse Edit/Write | in a `unit/*` worktree: writes outside the card's scope and merge-written files; anywhere: an edit changing `verified` events, `verified_hash` or the personal profile |
| secrets | PreToolUse Edit/Write | content matching secret patterns (keys, tokens, private keys); `profile.security.secrets` adds patterns |
| model | PreToolUse Agent | a builder, reviewer or researcher started with a `model` other than the card's, `models.review` or `models.research` |
| docs | PostToolUse Edit/Write under the bundle | returns OKF errors for the edited file so the agent fixes them at once |
| heartbeat | PreToolUse and PostToolUse | nothing; keeps the builder's, reviewer's or researcher's mark fresh, marks an owner prompt `ran` |
| steer | Stop | ends of turn while `next` has an autonomous action and no human gate is pending ([Steering](steering.md)) |
| prompt | UserPromptSubmit | nothing; stamps a typed `approve <doc>…`, records a typed `release I-<n>` or `rollback I-<n>` as a go |
| status | SessionStart (startup, resume, clear, compact, fork) | nothing; injects `aidlc status` and the resume line (≤ 1,000 chars) |
| denied | PermissionDenied Bash | nothing; records the command auto mode refused, so `next` hands it to the owner |

The guard matches a short deny list on parsed argv; it does not try to model the shell.

# Merge gate: `aidlc merge U-<n>`
Fails with one line per problem, each naming the fix, unless all hold:
1. Unit approved and not stale; deps merged.
2. Diff inside the card's scope; lane at merge ≥ lane at start.
3. Every AC has a test tagged `U-<n>/AC-<k>` in the diff or the base, at its level; not in the quick lane ([Unit card](unit-card.md#quick-lane)).
4. Profile checks for the touched modules, the project's `checks` (lint, format, static analysis) and every level `run` pass on the merged result; with the unit's code reverted, each level of its tagged tests fails (proof-revert). A quick-lane unit runs no level: the commands its ACs name run instead ([Merge mechanics](gate.md#details)).
5. Outside the quick lane, verdict `pass` for the current diff hash, plus each required specialist (a focus is required when its globs match the diff; `security` also when an added line matches `security.content`, M10 U75).
6. Bundle passes OKF validation.
7. Profile `security.check` commands pass when set (a secret scan, SAST, a dependency audit); the plugin runs them, it does not ship them.
8. Architecture: no denied dependency edge and every `architecture.checks` command passes, on every merge ([Architecture](architecture.md)).
On success: `git merge --no-ff` with five trailers, `Unit: U-<n>`, `Card: <hash>`, `Review: pass` (`none` in the quick lane), `Tested: <level>, …` and `Proof: <level>, …`. How it runs: [Merge mechanics](gate.md).

# Reviewer contract
Returns JSON only: `{verdict: pass|fix|escalate, focus?, findings: [{path, line, ac?, claim, scenario, confidence: CONFIRMED|PLAUSIBLE}]}`, at most 10 findings. `review record` may record another verdict than the one sent, and tells the reviewer why ([Review rounds](review-rounds.md)). The reviewer reads tests first.

How a review runs, and why there is no separate architecture focus: [Skill and agents](prompts.md#review).

# CI mode
`aidlc check --ci` runs OKF validation, plan lint and, for each merge commit on the base, its `Unit`, `Card` and `Review` trailers and scope. It needs only Node and the vendored CLI. The owner audits 1 merged unit in 10.

# Prompt evals
Prompts are code coupled to a model version. `tests/evals/` holds a fixture project with seeded defects (an AC without a real test, an out-of-scope edit, an injection, a missing authz check, a back-fill mutation that breaks only an edge of its AC). The reviewer must find each one; the builder must stop on the interface-change fixture, and on a back-fill unit list one mutation per AC with `breaks` and merge with `Proof: mutation`. Run before every release and on every model change; a miss blocks the release.

`node tests/evals/run.mjs setup <dir>` creates the fixture; after the reviewer and builder have run on it, `node tests/evals/run.mjs score <dir>` lists each seeded defect as found or missed. Results go to the pilot report.

# Later
- Later: an optional CI evaluator agent on pushes.

[^cc-hooks]: Claude Code hooks reference
