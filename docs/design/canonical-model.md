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
Every concept the plugin uses has one word, at one of five scales, drawn from `cli.json` `vocabulary` onto a page per scale: [System](diagrams/words-system.md), [Domain](diagrams/words-domain.md), [Code](diagrams/words-code.md), [Delivery](diagrams/words-delivery.md) and [Plugin](diagrams/words-plugin.md); the [words to avoid](diagrams/words-avoid.md) send a word in another sense to the one it means, and [Words by scale](diagrams/canonical-model.md) draws them. A test keeps the pages in step.

# The method's words and the plugin's own
"The method" names Intent, Unit, Bolt, the user story, the loop at every stage, Mob Elaboration, context kept in the repository and the walking skeleton first; "the plugin" names the closed kinds, one domain per bolt, increments, the naming registry and every rule as a check.

# Rules
- `cli.json` holds the vocabulary: words, retired words with their replacement, and the closed lists. Checks and the generated glossary read it, nothing else.
- `TERM-SYNONYM` reports a retired word in its old sense, in a project's docs and code and in this repo.
- **Pinned method.** Approving an intent writes `method: <version>`, a stamp outside the doc's hash, and the intent is judged by that method: one approved before pinning by method 1, a draft by the current one. `method.since` names the method each later rule starts at, by message key; `upgrade` lists the changes (`method.changes`).
- An approved intent's `method/` pages stay at its version ([Bundle](bundle.md)).

Bolts: [M15](../roadmap/m15.md) B150, B154; [M16](../roadmap/m16.md) B163; [M20](../roadmap/m20.md) B193; [M30](../roadmap/m30.md) B254.
