---
type: Principles
title: How {{name}} is built
description: The rules every change here follows, each with the checks that enforce it; the project adds its own below.
generated: { by: {{producer}}, at: {{at}} }
---

# Rules
1. **Spec first, with the why.** Code changes only under an approved bolt, and every requirement, intent, bolt and decision says why. Checked by `GATE-APPROVAL`, `PLAN-REQ` and `SCOPE-OUT`.
2. **Increments end to end.** An intent ships in increments, the walking skeleton first, each built by bolts with acceptance criteria at a test level and a scope that holds their tests. Checked by `PLAN-AC`, `PLAN-LEVEL`, `PLAN-TEST` and `PLAN-SCOPE`.
3. **End to end once per intent.** Each increment has an acceptance criterion at the top test level, and a bolt that crosses modules is tested above unit level. Checked by `PLAN-INCREMENT` and `PLAN-RUN`.
4. **Tests first, and tests that bite.** Every acceptance criterion has a tagged test that runs at its level and fails with the change reverted; a skipped test is no pass. A back-fill, a bolt that changes only tests, has no change to revert: it is proved by one mutation per AC that breaks the AC's main behaviour. A quick-lane bolt has no tagged tests and gets no proof: only the commands its ACs name run. Checked by `GATE-AC`, `GATE-LEVEL`, `GATE-RUN`, `GATE-PROOF` and `GATE-SKIP`.
5. **Fresh eyes review.** A reviewer who did not build the bolt passes it before the merge; a quick-lane bolt gets no review. Checked by `GATE-REVIEW` and `GATE-LANE`.
6. **The owner decides.** Intents, plans, one-way doors and releases wait for the owner; agents never approve. Checked by `PLAN-DECISION` and `GUARD-OWNER`.
7. **Released means running.** When the profile deploys, a release counts once its deploy check and smoke pass, and each intent links a runbook; the owner releases and rolls back. A back-fill intent ships no code: it needs no runbook and is released once merged. Checked by `PLAN-RUNBOOK` and `GUARD-OWNER`.
8. **Current dependencies.** Each dependency is the newest stable release with every known security fix, looked up from its registry when added or bumped, never from memory, and reported with its source; the project's scanners run at merge and daily in CI. Checked by `GATE-DEPENDENCY`, `CI-DEPENDENCY` and `aidlc report`.
9. **Vertical slices own their data.** Each vertical slice owns its data, its language and its contract, with internal layers pointing inward, and plugs into the horizontal layers through that contract. A vertical slice never reaches into another vertical slice's database; vertical slices communicate only through their published interfaces, events or shared domain services, and no modules depend on each other in a circle. Checked by `ARCH-DATA`, `ARCH-API`, `ARCH-CYCLE`, `ARCH-BOUNDARY`, `PROFILE-ARCH` and `PROFILE-KIND`.
10. **Identities, not secrets.** Each runtime and domain has its own workload identity. They call each other with mTLS or tokens bound to it, each domain's data is reachable only by its own identity with short-lived credentials, and outside services use federated credentials; nothing shares a static password or client secret. Checked by `GATE-IDENTITY` and `GATE-SECRET`.
11. **Architecture you can see.** The codebase tree, the module dependencies and the domains-and-layers page (domains side by side with their layers, the horizontal kinds as bands) are written at every merge from the profile, never by hand, and every module declares its kind. Checked by `PROFILE-KIND` and the codebase map.

# Project rules
Add the rules this project keeps beyond these, each with why and, where one exists, the check that enforces it.
