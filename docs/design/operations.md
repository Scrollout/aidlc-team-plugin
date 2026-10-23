---
type: Design
title: Deployment and operation
description: Draft - how the grid's Deployment and Operation rows run after an intent merges - deploy check, release, smoke, rollback, runbook and feedback - with the commands from the project profile.
status: draft
sources:
  - id: aws-ops
    resource: https://github.com/awslabs/aidlc-workflows/tree/ec48a1c421ef/core/aidlc-common/stages/operation
    title: AWS AI-DLC operation stages
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T08:00:00Z }
---

# Why
The [Grid](grid.md) has a Deployment and an Operation row, but the loop ends at a merged, tagged intent: nothing runs a deploy check, a release or a smoke test, and nothing turns a failed release into work. The owner asked for both rows (2026-10-24).

# What AWS AI-DLC does
Seven operation stages, every one conditional (`execution: CONDITIONAL`) and skipped when "no deployable target exists": deployment pipeline, environment provisioning, deployment execution, observability, performance validation, incident response, feedback.[^aws-ops] The parts this plugin can take without building pipelines:
- **Verify:** "Deployment is not done until smoke passes"; deployment execution runs smoke tests and health checks.
- **Rollback:** a rollback runbook is an output of the pipeline stage and is read again at deployment; "Rollback is not optional".
- **Gates:** "Bypassing a gate is an incident, not a shortcut"; each stage ends with the human's approve or request-changes.
- **Feedback:** "Production insights that do not flow back to Ideation are wasted learning"; the last stage can start a new ideation cycle.

# Shape
Commands come from the profile, as every check does; the plugin ships no pipeline ([Overview](overview.md) non-goals). All keys are optional: a project without them skips the rows, as AWS skips a stage with no target.
```json
"deploy": { "check": ["make image"], "run": "make deploy", "smoke": "make smoke", "rollback": "make rollback" },
"release": "make release"
```
1. **Deployment:** once an intent is merged, `next` runs `deploy.check` on the merged base before it offers the release; a failure names the command and becomes a fix unit.
2. **Release:** the owner's step. `next` names `release` (and `deploy.run`) for the owner; the CLI records that it ran and its exit, as for any owner command.
3. **Operation:** `deploy.smoke` runs after the release. A pass marks the intent released; a failure stops the loop with ⛔, names `deploy.rollback` for the owner, and drafts a fix unit from the smoke output.
4. **Runbook:** an intent with a `deploy` profile links a runbook doc (how to roll back, what to watch), checked by plan lint.
5. **Feedback:** the retro lists each failed check, smoke and rollback of the intent, and each fix unit they started.

# Choices
The owner's, 2026-10-24:
- The owner runs `deploy.run` and `release`: `next` names them as owner steps, as for every release.
- A failed smoke stops the loop; the owner rolls back. Nothing rolls back on its own.
- One deploy target per project; environment promotion is later.
- In: a runbook per intent, and the retro's feedback. Out: observability, SLO, load and incident stages.

Units: [M6](../roadmap/m6.md).

[^aws-ops]: AWS AI-DLC operation stages
