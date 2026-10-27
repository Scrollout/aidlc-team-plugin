---
type: Design
title: Canonical model
description: One word per concept at each scale (system, domain, code, delivery), mapped to AI-DLC's Intent, Unit and Bolt, with the rule that a word used in another sense fails a check and that an approved intent keeps the method version it was approved under.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Sources
The method definition whitepaper, the reference AI-DLC workflows (2.11.1) and the method's launch talk (2025), read on 2026-10-26; the standard definitions of vertical slices and horizontal layers, and layering and modular-monolith practice ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)).

# Why
A word with two meanings can't be checked, so every concept gets one word at one scale ([0013](../decisions/0013-a-deterministic-ai-dlc.md)). The words are the sources' own: the method's Intent, Unit and Bolt; horizontal layers, code grouped by technical concern and shared by every feature; and vertical slices, code grouped by business feature or use case, cutting through those layers and naming the use case it serves ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)).

# Words
Drawn by scale: [Words by scale](diagrams/canonical-model.md).
Generated from `cli.json` `vocabulary`; a test keeps it in step.

<!-- generated: glossary -->
| Scale | Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|---|
| System | horizontal layer | code grouped by one technical concern and shared by every feature: the interface, application, model and infrastructure layers inside a domain, pointing inward, and the platform every request crosses | logical design | the stack pack's layers; module `kind: runtime`, `pipeline`, `foundation` or `adapter` |
| System | core | the platform layers and the shared domains every domain uses | the system | profile `system.core` |
| System | extension | a domain another team owns, built only against published contracts | another team's Units | profile `system.extensions` |
| Domain | domain | a bounded context holding the vertical slices of one business capability, with its data, language, contract and events | **Unit** | `domains/<code>.md`, module `kind: domain` |
| Domain | kind | `domain`, `pipeline`, `foundation`, `adapter`, `runtime`, `extension` or `delivery` | - | module `kind` |
| Code | vertical slice | the code of one business feature or use case, a command or a query, in its own folder, cutting through every horizontal layer it needs; it names the use case it serves | a user story, cut through all layers | the domain's `surface` |
| Delivery | intent | one business outcome, with its why and success measures | **Intent** | `intents/I-<n>-<slug>.md` |
| Delivery | increment | a shippable step of an intent; increment 1 is the walking skeleton | groups Bolts | the intent's `# Increments`, `I-<n>.<k>` |
| Delivery | bolt | the smallest build cycle: one card, worktree, review and merge | **Bolt** | `bolts/B-<n>-<slug>.md` |
| Delivery | fix bolt | one regression, one AC that fails before the fix | defect-fix pathway | a bolt with no `intent` |
| Plugin | lane | quick, standard or full; decides which grid rows run | - | the profile's `lanes` |
| Plugin | card | the generated brief one builder works from and one reviewer checks against | - | `aidlc card` |
| Plugin | lead | the main session running the loop | - | the skill |
| Plugin | owner | the human who approves, releases and rolls back | - | `human:` stamps |

**Retired, in these senses:** *unit* (a work item) → bolt (unit stays a test level); *slice* (a delivery step) → increment; *operation* (one command or query) → vertical slice; *internal layer* (a layer inside a domain) → horizontal layer; *bundle* (a piece of the architecture, not the docs bundle) → domain; *component* (a piece of the architecture) → domain, or runtime for a deployable; *capability* (a module) → domain.
<!-- /generated -->

# What is AI-DLC's and what is the plugin's own
- **From AI-DLC:**
  - Intent, Unit, Bolt;
  - the loop at every stage (AI plans, human validates, AI executes, human verifies);
  - Mob Elaboration;
  - context kept in the repository;
  - the walking-skeleton first Unit.
- **The plugin's own, to reach AI-DLC's enterprise goal:**
  - the closed kinds and the kind matrix;
  - one domain per bolt;
  - increments;
  - the naming registry;
  - every rule as a check.

  Neither the reference AI-DLC workflows nor the method's launch talk gives a rule for where a Unit's boundary falls.

Docs and messages say "the method" for the first group and "the plugin" for the second, never "AI-DLC requires" for the plugin's own rules.

# Rules
- `cli.json` holds the vocabulary: words, retired words with their replacement, and the closed lists. Checks and the generated glossary read it, nothing else.
- `TERM-SYNONYM` reports a retired word in its old sense, on the project's docs and code (M16) and on this repo (M20).
- **Pinned method.** Approving an intent writes `method: <version>` (`cli.json` `method.version`), a stamp field outside the doc's hash. An intent is judged by that method; one approved before pinning by method 1, a draft by the current one. A rule a later method added is listed in `method.since` by its message key, and holds only for intents pinned at or after it. `upgrade` lists the changes since the pinned CLI's method (`method.changes`).
- An approved intent's `method/` pages are frozen at its version ([Bundle](bundle.md)).

Bolts: [M15](../roadmap/m15.md) B150, B154; still to build: B163 and B193 (`TERM-SYNONYM`).
