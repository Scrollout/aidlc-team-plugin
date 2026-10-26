---
type: Design
title: Deployment and operation
description: How the grid's Deployment and Operation rows run after an intent merges - deploy check, release, smoke, rollback, runbook and feedback - with the commands from the project profile.
status: draft

generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T08:00:00Z }
---

# Why
Before M6 the loop ended at a merged, tagged intent: the [Grid](grid.md)'s Deployment and Operation rows ran nothing. The owner asked for both rows (2026-10-24).

# The reference stages
Seven operation stages, every one conditional (`execution: CONDITIONAL`) and skipped when "no deployable target exists": deployment pipeline, environment provisioning, deployment execution, observability, performance validation, incident response, feedback. What the plugin takes without building pipelines:
- **Verify:** "Deployment is not done until smoke passes"; deployment execution runs smoke tests and health checks.
- **Rollback:** a rollback runbook, output by the pipeline stage; "Rollback is not optional".
- **Gates:** "Bypassing a gate is an incident, not a shortcut"; each stage ends with the human's approve or request-changes.
- **Feedback:** "Production insights that do not flow back to Ideation are wasted learning"; the last stage can start a new ideation cycle.

# Shape
Commands come from the profile; the plugin ships no pipeline ([Overview](overview.md) non-goals). All keys are optional: without them the rows are skipped, as the reference stages skip one with no target.
```json
"deploy": { "check": ["make image"], "run": "make deploy", "smoke": "make smoke", "rollback": "make rollback", "platform": ["../infra"] },
"release": "make release"
```
1. **Deployment:** once an intent is merged, `next` asks the lead to run `deploy.check` on the merged base before it offers the release; a failure becomes a fix unit.
2. **Release:** the owner's step, `aidlc release I-<n>`, which runs `deploy.run` and `release` and records the run.
3. **Operation:** `deploy.smoke` runs after the release. A pass marks the intent released; a failure stops the loop with ⛔ and names the owner's rollback, then a fix unit from the smoke output.
4. **Runbook:** an intent with a `deploy` profile links a runbook doc (how to roll back, what to watch, who to call), checked by plan lint as `PLAN-RUNBOOK`; `init` ships `.aidlc/templates/docs/runbook.md`.
5. **Platform:** `deploy.platform` names where the target is already defined, or `[]`; plan lint asks (`PLAN-PLATFORM`) and cards list it.
6. **Feedback:** each failed step adds `{ intent, step, command, at }` to the `deployFailures` counter list; the retro lists them with the fix units whose `after` names the intent.

# Choices
The owner's, 2026-10-24:
- The owner runs `deploy.run` and `release`: `next` names them as owner steps, as for every release.
- A failed smoke stops the loop; the owner rolls back. Nothing rolls back on its own.
- One deploy target per project; environment promotion is later.
- In: a runbook per intent, and the retro's feedback. Out: observability, SLO, load and incident stages.

# Details
- **Record:** `.git/aidlc/deploys/I-<n>.json` keeps the last run of each step (`check`, `release`, `smoke`, `rollback`) with its exit, the failing command, the tail of its output and the base commit it ran on. `aidlc deploy` writes it; `next` only reads it. Steps run in the work tree, on the base.
- **Check:** with `deploy.check`, a merged intent's `next` is `aidlc deploy check I-<n>` until a check ran on the current base; a failed check names the command and `aidlc fix … --scope …`. The fix unit is plan work and comes first; once it merges the base moves and the check runs again.
- **Release:** with `deploy` or `release` in the profile, `next` names `aidlc release I-<n>` as the owner's step; it runs `deploy.run` and then `release`, and the intent is released when that run passed. With `deploy.check` set it is refused until a check passed on the current base. A release tag still counts as the owner's release (owner, 2026-10-24), and without either key the owner tags as before. An intent that ships nothing (a back-fill; with `modules`, merges touching no module or one-way door) is released once merged and needs no runbook. A failed release is a ⛔ stop: the owner retries, or the lead drafts a fix. So `deploy.run` must be safe to run twice on the same base (a sync or an apply, not a script that creates what exists): the retry reruns it.
- **Slice release:** once per merged slice, while the next slices build ([Slices](slices.md#shipping-a-slice)).
- **Smoke and rollback:** `aidlc release` runs `deploy.smoke` after a passing release; the intent is released once both passed. A failed smoke is a ⛔ stop before any other work: `next` names `aidlc rollback I-<n>`, the owner's command, which runs `deploy.rollback` (without one it records the owner's rollback by hand), on a merged or released intent. Then `next` asks for a fix unit from the smoke output, `aidlc fix … --after I-<n>`; once it merges, the check and release run again on the new base.
- **Words to type:** a deploy outlasts the prompt hook's 10 s limit, so the hook does not run it ([0012](../decisions/0012-typed-go.md)). A prompt that is exactly `release I-<n>` or `rollback I-<n>` records the owner's go for that command at the current commit in `.git/aidlc/goes.json`; the lead runs the command, and the guard lets that one call through without a prompt and uses the go up. States: [Intent states](intent-states.md).
- **Parking:** `aidlc hold I-<n> <reason>` on a merged intent parks its check, release and fix lines; `next` names the hold as the owner's step until `hold I-<n> off`. A failed smoke still stops (from the M6 pilot).

Units: [M6](../roadmap/m6.md).

: Reference AI-DLC operation stages
