# AGENTS.md

{{name}}: work here follows the AI-DLC grid. Specs come first, a CLI and hooks enforce the rules, and progress is derived from git and the docs, never tracked by hand.

`aidlc` below means `node .aidlc/bin/aidlc.mjs`, the CLI pinned in this repo.

## Start here
- Run `aidlc next` and do only the action it prints. `aidlc status` shows where things stand.
- The docs live in `{{bundle}}/` (OKF). Read an index, then one doc. Indexes are generated; never edit them by hand.
- How work is built here, and the check behind each rule: `{{bundle}}/constitution/principles.md`.

## How work flows
1. Requirements (`{{bundle}}/requirements/R-<n>-<slug>.md`) state what must always hold.
2. An intent (`{{bundle}}/intents/I-<n>-<slug>.md`) states a goal, why and success measures. The owner approves it.
3. Units (`{{bundle}}/units/U-<n>-<slug>.md`) slice the intent: ACs with a test level, scope, depends, the requirements they serve. The owner approves the plan.
4. Each unit is built from its card (`aidlc card U-<n>`) in its own worktree, tests first and only inside its scope, then reviewed and merged by the gate.
5. When the profile deploys, a merged intent runs its deploy check on the base; the owner releases it and its smoke runs. A failed check or smoke becomes a fix unit (`aidlc fix`); a failed smoke is rolled back by the owner first.

Templates for each doc type are in `.aidlc/templates/docs/`.

## Rules
- Change code only under an approved unit; a doc changes before or with the code it describes.
- Every requirement, intent, unit and decision states its why.
- Never edit `index.md`, `log.md`, approvals (`verified`, `verified_hash`) or generated files by hand.
- Only the owner approves intents, plans and one-way-door decisions, and releases or rolls back an intent: they confirm the prompt, or type `release I-<n>` or `rollback I-<n>`.
- Run `aidlc check` before every commit.

## Commands
- `aidlc next`, `aidlc status`: what to do now, where things stand.
- `aidlc check [path]`: docs and plan checks.
- `aidlc lane U-<n>`: the unit's lane and why.
- `aidlc card U-<n>`: the brief a builder or reviewer works from.
