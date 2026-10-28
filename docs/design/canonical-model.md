---
type: Design
title: Canonical model
description: One word per concept at each scale (system, domain, code, delivery), mapped to the method's Intent, Unit and Bolt; a word in another sense fails a check, and an approved intent keeps the method version it was approved under.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Sources
The method definition, the reference AI-DLC workflows and the method's launch talk; the official definitions of vertical slices and horizontal layers ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)).

# Why
A word with two meanings can't be checked, so every concept gets one word at one scale ([0013](../decisions/0013-a-deterministic-ai-dlc.md)), the sources' own: the method's Intent, Unit and Bolt; horizontal layers; vertical slices and what they declare ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md), [0026](../decisions/0026-a-slice-declares-the-layers-it-needs-and.md)).

# Words
Drawn by scale: [Words by scale](diagrams/canonical-model.md).
Generated from `cli.json` `vocabulary`; a test keeps it in step.

<!-- generated: glossary -->
| Scale | Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|---|
| System | horizontal layer | code grouped by one technical concern, shared by every feature: the layers inside a domain, pointing inward, and the platform every request crosses | logical design | the stack pack's layers; module `kind: runtime`, `pipeline`, `foundation` or `adapter` |
| System | core | the platform layers and the shared domains every domain uses | the system | profile `system.core` |
| System | extension | a domain another team owns, built only against published contracts | another team's Units | profile `system.extensions` |
| Domain | domain | a bounded context holding the vertical slices of one business capability, with its data, language, contract and events | a Domain Design component | `domains/<code>.md`, module `kind: domain` |
| Domain | kind | `domain`, `pipeline`, `foundation`, `adapter`, `runtime`, `extension` or `delivery` | - | module `kind` |
| Code | vertical slice | the code of one use case, a command or a query, cutting through every horizontal layer it needs; it names the use case it serves | a user story, cut through all layers | a `Command` or `Query` line of its domain doc's `# Surface` |
| Code | cut | a layer a vertical slice cuts through, from the stack pack's `slicePaths` | - | a slice's declaration |
| Code | entry | the runtime serving a slice, and what it applies to each | - | a slice's `entry` |
| Code | hand-off | an integration event or a call between domains | - | `emits`, `consumes`, `calls` |
| Code | permission | what a caller needs for a slice, enforced at its entry | - | a slice's `permission` |
| Code | surface | what a domain offers others: its commands, queries and events | integration specification | the domain doc's `# Surface`; the profile's `surfaces` |
| Delivery | intent | one business outcome, with its why and success measures | **Intent** | `intents/I-<n>-<slug>.md` |
| Delivery | story | one use case a user wants, as a persona, a capability and a benefit, served by a vertical slice | user story | the intent's `# Stories`, `US<g>.<s>` |
| Delivery | unit of work | a cohesive part of an intent built by one team, with its stories, slices and dependencies | **Unit** | the intent's `# Units` |
| Delivery | increment | a shippable step of an intent; increment 1 is the walking skeleton | groups Bolts | the intent's `# Increments`, `I-<n>.<k>` |
| Delivery | bolt | the smallest build cycle: one card, worktree, review and merge | **Bolt** | `bolts/B-<n>-<slug>.md` |
| Delivery | fix bolt | one regression, one AC that fails before the fix | defect-fix pathway | a bolt with no `intent` |
| Plugin | lane | quick, standard or full; decides which grid rows run | - | the profile's `lanes` |
| Plugin | card | the generated brief one builder works from and one reviewer checks against | - | `aidlc card` |
| Plugin | lead | the main session running the loop | - | the skill |
| Plugin | owner | the human who approves, releases and rolls back | - | `human:` stamps |

**Retired, in these senses:** *unit* (a work item) → bolt (unit stays a test level); *slice* (a delivery step) → increment; *operation* (one command or query) → vertical slice; *internal layer* (a layer inside a domain) → horizontal layer; *bundle* (a piece of the architecture, not the docs bundle) → domain; *component* (a piece of the architecture) → domain, or runtime for a deployable; *capability* (a module) → domain; *schema* (a slice's layer) → migration; *action* (a slice's right) → permission; *mode* (how a slice answers) → async; *part* (a slice's layer) → cut; *contract* (what a slice reaches) → declaration.
<!-- /generated -->

# The method's words and the plugin's own
"The method" names Intent, Unit, Bolt, the user story, the loop at every stage, Mob Elaboration, context kept in the repository and the walking skeleton first; "the plugin" names the closed kinds, one domain per bolt, increments, the naming registry and every rule as a check.

# Rules
- `cli.json` holds the vocabulary: words, retired words with their replacement, and the closed lists. Checks and the generated glossary read it, nothing else.
- `TERM-SYNONYM` reports a retired word in its old sense, in a project's docs and code and in this repo.
- **Pinned method.** Approving an intent writes `method: <version>`, a stamp outside the doc's hash, and the intent is judged by that method: one approved before pinning by method 1, a draft by the current one. `method.since` names the method each later rule starts at, by message key; `upgrade` lists the changes (`method.changes`).
- An approved intent's `method/` pages stay at its version ([Bundle](bundle.md)).

Bolts: [M15](../roadmap/m15.md) B150, B154; [M16](../roadmap/m16.md) B163; [M20](../roadmap/m20.md) B193.
