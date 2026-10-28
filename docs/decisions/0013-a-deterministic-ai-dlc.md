---
type: Decision
title: 0013 A deterministic AI-DLC
description: One word per concept at each scale (core and extensions, domains of a fixed kind, slices and layers, intents, increments and bolts), every structural fact declared once and the rest generated, rules pinned per intent, and leftovers removed with their replacements.
status: accepted
decision-makers: the owner
date: 2026-10-26
supersedes: "0007"
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:20:00Z }
---

# A deterministic AI-DLC

## Context and Problem Statement
A project can build a sound shape and still drift, when the plugin lets its architecture drift:
- "Vertical slice" meant three things in the plugin: a delivery step (`slices.md`), a bounded context (`architecture-model.md`), and any module with `layers` (`map.mjs`). A project could change architecture vocabulary three times in a day.
- The profile had one axis, modules with layers. It could not tell a domain from a shared kit, or the core from an extension.
- Bolts were never tied to domains.
- Decisions were never checked against each other, and any number could be approved in one command.
- The delivered count trusted citations, not proof.
- Fix bolts carried a feature and a design change.

[0007](0007-requirements-and-architecture-as-checks.md) made requirements docs and architecture rules gate checks. That still holds, but its boundaries were written by hand per project, over a profile that could not express the shape.

## Considered Options
1. Patch each finding as it comes. That is how 39 incident rules accumulated, and the drift came from their interaction.
2. **A canonical model mapped to AI-DLC, with every structural fact declared once and the rest generated, rules pinned per intent, and replacements that delete what they replace.**
3. Copy the reference AI-DLC workflows' rules as they are. They leave a Unit's boundary to judgement, and the method's launch talk gives no rule for it either.

## Decision Outcome
Option 2:
- **Words.** Each concept has one word at one scale:
  - **System:** core, extension.
  - **Domain:** a bounded context. Every module has one of the kinds `domain`, `pipeline`, `foundation`, `adapter`, `runtime`, `extension`, `delivery`.
  - **Code:** slice (one command or query) and layer (`interface`, `application`, `model`, `infrastructure`, Evans' four).
  - **Delivery:** intent → increment (increment 1 is the walking skeleton) → bolt `B-<n>`, AI-DLC's *Bolt*, which replaces "unit U-n". An intent's unit of work is AI-DLC's *Unit*: a cohesive block of its stories, like a subdomain in DDD or an epic in Scrum.

  "Unit" names only AI-DLC's *Unit*, the unit of work, and a test level; never a work item.
- **Generated.** Maps, the context map, boundaries, name rules, cards, diagrams and status figures are derived from declarations. A hand edit to a generated doc is refused.
- **Pinned.** An approved intent is judged by the method version it was approved under. An upgrade applies to the next intent.
- **Budget.** The CLI stays within the line budget of [0017](0017-the-cli-is-a-library-with-extensions.md): the kind matrix, naming grammar, vocabularies and stack packs are data. A raise needs its own decision.
- **Stack packs:** Go first, then TypeScript.
- **Existing projects** stay on method v1 until a migration intent moves them.
- **Vocabularies and banned words** start from the plan's lists and grow only by owner-approved registry changes.
- **Removal.** A bolt that brings in a replacement deletes what it replaces. The only exception is read-only legacy aliases (`U-<n>`, `units/`), which expire one milestone after the last existing project migrates.
- **History.** Trial reports are condensed into one lessons doc. Local research is cited in the method doc and never committed.

Milestones: [M15](../roadmap/m15.md) to [M21](../roadmap/m21.md).

Principle 1: a rule that matters is a check. A word that means two things can't be checked, and a picture drawn by hand can't be trusted. Declaring each fact once and generating the rest makes drift a failing check instead of a review comment.

## More Information
Revisit when:
A project shows a scale the canonical model cannot express, or the generated artefacts cost more context than the hand-written ones they replace.
