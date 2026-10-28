---
type: Design
title: Delivery words
description: The canonical words at the delivery scale, each with its one meaning, the AI-DLC term it maps to and where it is declared; drawn from the vocabulary in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|
| binding | what a bolt is bound to: one domain, or one horizontal module a domain bolt of its increment needs | - | the bolt's `modules` |
| intent | one business outcome, with its why and success measures | **Intent** | `intents/I-<n>-<slug>.md` |
| owner's request | the owner's words, kept with an id for each sentence | - | `requests/Q-<n>-<slug>.md` |
| requirement | what the system shall do or be, in an EARS pattern | requirement | `requirements/R-<n>-<slug>.md` |
| persona | a kind of user, with what they want | Mob Elaboration | the intent's `# Personas` |
| fact | a platform fact with the source it was read from | - | `platform/F-<n>-<slug>.md` |
| decision | an architecture decision with its options and reasons, in MADR | decision record | `decisions/<NNNN>-<slug>.md` |
| pathway | `greenfield`, `feature`, `brownfield` or `model`: the steps an intent takes before approval | - | the intent's `pathway` |
| story | one use case a user wants, as a persona, a goal and a benefit, served by a vertical slice | user story | the intent's `# Stories`, `US<g>.<s>` |
| unit of work | a cohesive part of an intent built by one team, with its stories, slices and dependencies | **Unit** | the intent's `# Units` |
| increment | a shippable step of an intent; increment 1 is the walking skeleton | groups Bolts | the intent's `# Increments`, `I-<n>.<k>` |
| walking skeleton | increment 1: one slice through every layer, running end to end on its target | walking skeleton | the first line of `# Increments` |
| method version | the method an approved intent is judged by | - | the intent's `method` |
| release | shipping the merged increments: check, release, smoke, rollback | Operation | profile `deploy`, `release` |
| bolt | the smallest build cycle: one card, worktree, review and merge | **Bolt** | `bolts/B-<n>-<slug>.md` |
| fix bolt | one regression, one AC that fails before the fix | defect-fix pathway | a bolt with no `intent` |
