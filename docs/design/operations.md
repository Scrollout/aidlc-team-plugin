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
4. **Runbook:** an intent with a `deploy` profile links a runbook doc (how to roll back, what to watch, who to call), checked by plan lint as `PLAN-RUNBOOK`; `init` ships `.aidlc/templates/docs/runbook.md`.
5. **Feedback:** the retro lists each failed check, smoke and rollback of the intent, and each fix unit they started.

# Choices
The owner's, 2026-10-24:
- The owner runs `deploy.run` and `release`: `next` names them as owner steps, as for every release.
- A failed smoke stops the loop; the owner rolls back. Nothing rolls back on its own.
- One deploy target per project; environment promotion is later.
- In: a runbook per intent, and the retro's feedback. Out: observability, SLO, load and incident stages.

# Details
- **Record:** `.git/aidlc/deploys/I-<n>.json` keeps the last run of each step (`check`, `release`, `smoke`, `rollback`) with its exit, the failing command, the tail of its output and the base commit it ran on. `aidlc deploy` writes it; `next` only reads it. Steps run in the work tree, which must be on the base.
- **Check:** with `deploy.check`, a merged intent's `next` is `aidlc deploy check I-<n>` until a check ran on the current base; a failed check names the command and `aidlc fix … --scope …`. The fix unit is plan work and comes first; once it merges the base moves and the check runs again.
- **Release:** with `deploy` or `release` in the profile, `next` names `aidlc release I-<n>` as the owner's step; it runs `deploy.run` and then `release`, and the intent is released when that run passed (the tag no longer decides). Without either key the owner tags the release as before. A failed release is a ⛔ stop: the owner retries, or the lead drafts a fix.
- **Smoke and rollback:** `aidlc release` runs `deploy.smoke` after a passing release; the intent is released once both passed. A failed smoke is a ⛔ stop before any other work: `next` names `aidlc rollback I-<n>`, the owner's command, which runs `deploy.rollback` (without one it records the owner's rollback by hand). Then `next` asks for a fix unit from the smoke output, `aidlc fix … --after I-<n>`; once it merges, the check and release run again on the new base.
- **Words to type:** a deploy outlasts the prompt hook's 10 s limit, so the hook does not run it (owner's choice, 2026-10-24). A prompt that is exactly `release I-<n>` or `rollback I-<n>` records the owner's go for that command at the current commit in `.git/aidlc/goes.json`; the lead then runs the command, and the guard lets that one call through without a permission prompt and uses the go up. The host's own permission check still applies.
- **Feedback:** each failed step adds `{ intent, step, command, at }` to the `deployFailures` counter list; the retro lists them with the units whose `after` names the intent.

Units: [M6](../roadmap/m6.md).

[^aws-ops]: AWS AI-DLC operation stages
