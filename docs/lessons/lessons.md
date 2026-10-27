---
type: Research
title: Lessons
description: Failure modes of an AI-DLC loop, one lesson each, with the rule, check or design doc that now holds it; the open ones are on the Later list.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T15:00:00Z }
---

Each lesson names what goes wrong when nothing holds it, then what holds it now.

# Planning
- A bolt whose whole job is a file the merge writes → `PLAN-SHARED`.
- A test location the plan needs is added to the profile outside `next` → `PLAN-TEST` names adding the profile to the scope.
- A profile keys modules by `name`, so cards lose their checks → `PLAN-MODULE`, `PROFILE-KIND`.
- One approval misses the draft requirement it cites → the first approval names it ([Approvals](../design/approvals.md)).
- A one-way door has no decision, or a bundle-root link does not count → `PLAN-DECISION`.
- A scope names a generated file without its source, or an untracked copy → `PLAN-GENERATED`.
- An AC carries the wrong level for its test → `GATE-LEVEL`.
- A fix skeleton fails plan lint → `aidlc fix` prints its findings; `FIX-SHAPE`.
- A back-fill is asked for a runbook and a release → a bolt that ships nothing skips them ([Back-fill](../design/backfill.md)).

# Building
- Builders write code before tests → proof-revert, `GATE-PROOF`, `PROOF-AC`.
- A stopped builder's heartbeat reads as a restart, and a fresh one hides a fix round → the launch mark decides ([In flight](../design/in-flight.md)).
- Long test calls leave stale in-flight marks → calls keep the heartbeat fresh ([In flight](../design/in-flight.md)).
- Builder worktrees outlive their merge → the merge removes clean ones, `next` names the rest.
- A send-back reaches the builder with no reason → the card lists it; the retro counts it.
- Tests carry the tag in a function name only → `GATE-AC` and the reviewer's send-back.
- A builder merges the base into a restarted branch by hand → `aidlc start` does it.

# Review and gate
- Any second `fix` escalates, and a reviewer's own escalate skips the limit → [Review rounds](../design/review-rounds.md).
- Every round re-runs every focus → a focus keeps its pass when the fix touches none of its files.
- A pass carries a confirmed finding, which lands → it becomes a fix round; any security finding waits for the owner (`REVIEW-SECURITY`).
- A skipped test counts as a pass → `GATE-SKIP`.
- A run that checks `git diff` is fooled by the revert → the index goes back too ([Merge mechanics](../design/gate.md)).
- A fix round never runs the project's lint → module and profile checks run at every merge (`GATE-CHECK`).

# Owner
- `aidlc approve` is typed as a sentence, and `!` commands do not run on mobile → typed words and permission prompts ([0009](../decisions/0009-owner-commands-by-permission-prompt.md), [0015](../decisions/0015-one-way-doors-are-approved-one-at-a.md)).
- Auto mode refuses the lead's delegated approvals → `next` hands them to the owner ([Approvals](../design/approvals.md)).
- A typed `release I-n` fails on a redirect or a full stop → the guard matches the words ([0012](../decisions/0012-typed-go-for-release-and-rollback.md)).
- `upgrade` can downgrade the CLI, run from a dirty tree and bring no new templates → [Vendoring](../design/vendoring.md).
- A missing pinned CLI makes the Stop hook block every turn → the hook passes non-tool events ([Hook mechanics](../design/hooks.md)).
- Run-mode instructions are lost on `/clear` → `aidlc mode`.
- The lead's session is most of the cost → a clear per intent ([Resume](../design/resume.md)).

# Operations and research
- Adding `deploy` turns intents released by tag back into merged → a tag counts ([Deployment and operation](../design/operations.md)).
- A merged intent cannot be parked → `hold I-n`.
- The retro misses stops, hand-run approvals, cited decisions and fix bolts → [Steering](../design/steering.md).
- `next` asks again for a researcher still running, and a filed digest never releases its hold → in-flight researchers; an answered hold no longer holds ([0010](../decisions/0010-research-for-open-questions.md)).
- A digest breaks the project's doc rules → the lead sends `check` findings back to the researcher.
- A second board is created on a short list → `sync` relists before creating ([Board](../design/board.md)).

# Open
On the [Later](../roadmap/later.md) list:
- A reviewer can pass a mutation that breaks only part of its AC.
- `next` serves one intent at a time.
- Two reviewers can write test logs to the same file name.
- A merge takes minutes on a real project.
- `PLAN-GENERATED` accepts one output of a generator that writes two.
