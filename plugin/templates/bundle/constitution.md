---
type: Principles
title: How {{name}} is built
description: The rules every change here follows, each with the checks that enforce it; the project adds its own below.
generated: { by: {{producer}}, at: {{at}} }
---

# Rules
1. **Spec first, with the why.** Code changes only under an approved unit, and every requirement, intent, unit and decision says why. Checked by `GATE-APPROVAL`, `PLAN-REQ` and `SCOPE-OUT`.
2. **Vertical slices.** An intent is cut into units that each deliver a working slice, with acceptance criteria at a test level and a scope that holds their tests. Checked by `PLAN-AC`, `PLAN-LEVEL`, `PLAN-TEST` and `PLAN-SCOPE`.
3. **End to end once per intent.** Each intent has an acceptance criterion at the top test level, and a unit that crosses modules is tested above unit level. Checked by `PLAN-SLICE` and `PLAN-RUN`.
4. **Tests first, and tests that bite.** Every acceptance criterion has a tagged test that runs at its level and fails with the change reverted; a skipped test is no pass. A back-fill, a unit that changes only tests, has no change to revert: it is proved by one mutation per AC that breaks the AC's main behaviour. A quick-lane unit has no tagged tests and gets no proof: only the commands its ACs name run. Checked by `GATE-AC`, `GATE-LEVEL`, `GATE-RUN`, `GATE-PROOF` and `GATE-SKIP`.
5. **Fresh eyes review.** A reviewer who did not build the unit passes it before the merge; a quick-lane unit gets no review. Checked by `GATE-REVIEW` and `GATE-LANE`.
6. **The owner decides.** Intents, plans, one-way doors and releases wait for the owner; agents never approve. Checked by `PLAN-DECISION` and `GUARD-OWNER`.
7. **Released means running.** When the profile deploys, a release counts once its deploy check and smoke pass, and each intent links a runbook; the owner releases and rolls back. A back-fill intent ships no code: it needs no runbook and is released once merged. Checked by `PLAN-RUNBOOK` and `GUARD-OWNER`.
8. **Current dependencies.** Each dependency is the newest stable release with every known security fix, looked up from its registry when added or bumped, never from memory, and reported with its source; the project's scanners run at merge and daily in CI. Checked by `GATE-DEPENDENCY`, `CI-DEPENDENCY` and `aidlc report`.
9. **Slices own their data.** The code is vertical slices, each with inward-pointing layers. One slice never directly calls the internal database layer of another slice. If slices need to communicate, they do so through well-defined interfaces, events, or shared domain services. No slices depend on each other in a circle. Checked by `ARCH-DATA`, `ARCH-API`, `ARCH-CYCLE`, `ARCH-BOUNDARY` and `PROFILE-ARCH`.

# Project rules
Add the rules this project keeps beyond these, each with why and, where one exists, the check that enforces it.
