---
type: Research
title: Pilot lessons
description: What the pilots from M1 to M8 taught, one lesson each, with the rule, check or design doc that now holds it; the open ones are on the Later list.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T15:00:00Z }
---

Eleven pilots ran from 2026-10-22 to 2026-10-24 on a scratch copy of a multi-service project, plus scripted runs and prompt evals. The reports are in git history.

# Planning
- A bolt whose whole job was a file the merge writes → `PLAN-SHARED`.
- A test location the plan needed was added to the profile outside `next` → `PLAN-TEST` names adding the profile to the scope.
- A profile keyed modules by `name`, so cards lost their checks → `PLAN-MODULE`, `PROFILE-KIND`.
- One approval missed the draft requirement it cited → the first approval names it ([Approvals](../design/approvals.md)).
- A one-way door had no decision, and a bundle-root link did not count → `PLAN-DECISION`.
- A scope named a generated file without its source, then an untracked copy → `PLAN-GENERATED`.
- An AC carried the wrong level for its test → `GATE-LEVEL`.
- The fix skeleton failed plan lint → `aidlc fix` prints its findings; `FIX-SHAPE`.
- A back-fill was asked for a runbook and a release → a bolt that ships nothing skips them ([Back-fill](../design/backfill.md)).

# Building
- Builders wrote code before tests → proof-revert, `GATE-PROOF`, `PROOF-AC`.
- A stopped builder's heartbeat read as a restart, and a fresh one hid a fix round → the launch mark decides ([In flight](../design/in-flight.md)).
- Long test calls left stale in-flight marks → calls keep the heartbeat fresh ([In flight](../design/in-flight.md)).
- Builder worktrees outlived their merge → the merge removes clean ones, `next` names the rest.
- A send-back reached the builder with no reason → the card lists it; the retro counts it.
- Tests carried the tag in a function name only → `GATE-AC` and the reviewer's send-back.
- A builder merged the base into a restarted branch by hand → `aidlc start` does it.

# Review and gate
- Any second `fix` escalated, and a reviewer's own escalate skipped the limit → [Review rounds](../design/review-rounds.md).
- Every round re-ran every focus → a focus keeps its pass when the fix touches none of its files.
- A pass carried a confirmed finding, which landed → it becomes a fix round; any security finding waits for the owner (`REVIEW-SECURITY`).
- A skipped test counted as a pass → `GATE-SKIP`.
- A run that checks `git diff` was fooled by the revert → the index goes back too ([Merge mechanics](../design/gate.md)).
- A fix round never ran the project's lint → module and profile checks run at every merge (`GATE-CHECK`).

# Owner
- `aidlc approve` was typed as a sentence, and `!` commands do not run on mobile → typed words and permission prompts ([0009](../decisions/0009-owner-commands-by-permission-prompt.md), [0015](../decisions/0015-one-way-doors-are-approved-one-at-a.md)).
- Auto mode refused the lead's delegated approvals → `next` hands them to the owner ([Approvals](../design/approvals.md)).
- A typed `release I-n` failed on a redirect or a full stop → the guard matches the words ([0012](../decisions/0012-typed-go-for-release-and-rollback.md)).
- `upgrade` downgraded the CLI, ran from a dirty tree and brought no new templates → [Vendoring](../design/vendoring.md).
- A missing pinned CLI made the Stop hook block every turn → the hook passes non-tool events ([Hook mechanics](../design/hooks.md)).
- Run-mode instructions were lost on `/clear` → `aidlc mode`.
- The lead's session was most of the cost → a clear per intent ([Resume](../design/resume.md)).

# Operations and research
- Adding `deploy` turned intents released by tag back into merged → a tag counts ([Deployment and operation](../design/operations.md)).
- A merged intent could not be parked → `hold I-n`.
- The retro missed stops, hand-run approvals, cited decisions and fix bolts → [Steering](../design/steering.md).
- `next` asked again for a researcher still running, and a filed digest never released its hold → in-flight researchers; an answered hold no longer holds ([0010](../decisions/0010-research-for-open-questions.md)).
- A digest broke the project's doc rules → the lead sends `check` findings back to the researcher.
- A second board was created on a short list → `sync` relists before creating ([Board](../design/board.md)).

# Open
On the [Later](../roadmap/later.md) list:
- A reviewer passed a mutation that breaks only part of its AC.
- `next` serves one intent at a time.
- Two reviewers wrote test logs to the same file name.
- A merge took four to six minutes.
- `PLAN-GENERATED` accepts one output of a generator that writes two.
