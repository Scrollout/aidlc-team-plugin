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
4. **Tests first, and tests that bite.** Every acceptance criterion has a tagged test that runs at its level and fails with the change reverted; a skipped test is no pass. Checked by `GATE-AC`, `GATE-LEVEL`, `GATE-RUN`, `GATE-PROOF` and `GATE-SKIP`.
5. **Fresh eyes review.** A reviewer who did not build the unit passes it before the merge. Checked by `GATE-REVIEW`.
6. **The owner decides.** Intents, plans, one-way doors and releases wait for the owner; agents never approve. Checked by `PLAN-DECISION` and `GUARD-OWNER`.
7. **Released means running.** A release counts once its deploy check and smoke pass, and each intent links a runbook. Checked by `PLAN-RUNBOOK`.

# Project rules
Add the rules this project keeps beyond these, each with why and, where one exists, the check that enforces it.
