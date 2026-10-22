---
type: Design
title: Verification
description: The inner loop (hooks), the merge gate, the reviewer's output contract and the CI mode.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** Hooks block rule breaks as they happen; the merge gate checks the finished unit; a fresh reviewer checks intent; CI re-runs the gate so nothing bypasses it.

## Inner loop: hooks
All hooks are thin wrappers that call the vendored CLI and fail closed (a crash denies).
| Hook | Event | Blocks |
|---|---|---|
| guard | PreToolUse Bash | force push; `--no-verify` / `-n` on commit; `aidlc approve`; raw `git merge` of a `unit/*` branch into base; deleting the base |
| scope | PreToolUse Edit/Write | in a `unit/*` worktree: writes outside the card's scope; anywhere: an edit adding or changing a `human:` `verified` entry or `verified_hash` |
| docs | PostToolUse Edit/Write under the bundle | returns OKF errors for the edited file so the agent fixes them at once |
| secrets | PreToolUse Edit/Write | content matching secret patterns (keys, tokens, private keys); `.aidlc/rules` can add patterns |
| steer | Stop | ends of turn while `next` has an autonomous action and no human gate is pending (see [Steering](steering.md)) |
| status | SessionStart (startup, resume, clear, compact) | nothing; injects `aidlc status` and the resume line (≤ 1,000 chars) |
| heartbeat | PostToolUse, in a `unit/*` worktree | nothing; touches the unit's heartbeat file |

The guard matches a short deny list on parsed argv; it does not try to model the shell.

## Merge gate: `aidlc merge U-<n>`
Fails with one line per problem, each naming the fix, unless all hold:
1. Unit approved and not stale; deps merged.
2. Diff inside the card's scope; lane at merge ≥ lane at start.
3. Every AC has a test tagged `U-<n>/AC-<k>` in the diff or the base, at the level the AC declares. Full lane adds proof-revert: with the unit's production changes reverted, every AC test must fail.
4. Profile checks for the touched modules pass on the merged result.
5. Reviewer verdict `pass` for the current diff hash, plus each required specialist (security is required when a security glob or content pattern matches).
6. Bundle passes OKF validation.
7. Profile `security.check` commands pass when set (e.g. secret scan, SAST, dependency audit such as gitleaks, semgrep, govulncheck); the plugin runs them, it does not ship them.
On success: `git merge --no-ff` with trailers `Unit: U-<n>`, `Card: <hash>`, `Review: pass`.

## Reviewer contract
Returns JSON only: `{verdict: pass|fix|escalate, findings: [{path, line, ac?, claim, scenario, confidence: CONFIRMED|PLAUSIBLE}]}`, at most 10 findings. Round 1 `fix` → builder fixes → round 2. A second `fix` becomes `escalate`: the owner decides. The reviewer reads tests first: tests are what the owner samples.

## CI mode
`aidlc check --ci` runs OKF validation, plan lint and, for each merge commit on the base, its trailers and scope. It needs only Node and the vendored CLI. A human samples about one merged unit in ten to audit the reviewer.

## Prompt evals
The skill and agent prompts are code coupled to a model version. `tests/evals/` holds a fixture project with seeded defects (an AC without a real test, an out-of-scope edit, an injection, a missing authz check). The reviewer must find each one; the builder must stop on the interface-change fixture. Run before every release and on every model change; a miss blocks the release.

## Later
- M2: proof-revert for the standard lane too, once the pilot shows its runtime cost.
- M3: an optional CI evaluator agent on pushes.
