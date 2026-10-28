---
type: Design
title: Canonical model
description: One word per concept at each scale (system, domain, code, delivery, plugin), mapped to the method's Intent, Unit and Bolt; a word in another sense fails a check, and an approved intent keeps the method version it was approved under.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Sources
The method definition, the reference AI-DLC workflows and the method's launch talk; the official definitions of vertical slices and horizontal layers ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)).

# Why
A word with two meanings can't be checked, so every concept gets one word at one scale ([0013](../decisions/0013-a-deterministic-ai-dlc.md)), the sources' own: the method's Intent, Unit and Bolt; horizontal layers; vertical slices and what they declare ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md), [0026](../decisions/0026-a-slice-declares-the-layers-it-needs-and.md)).

# Words
Every concept the plugin uses has one word, at one of five scales, drawn from `cli.json` `vocabulary` onto a page per scale: [System](tables/words-system.md), [Domain](tables/words-domain.md), [Code](tables/words-code.md), [Delivery](tables/words-delivery.md) and [Plugin](tables/words-plugin.md); the [words to avoid](tables/words-avoid.md) send a word in another sense to the one it means, and [Words by scale](diagrams/canonical-model.md) draws them. A test keeps the pages in step.

# The method's words and the plugin's own
"The method" names Intent, Unit, Bolt, the user story, the loop at every stage, Mob Elaboration, context kept in the repository and the walking skeleton first; "the plugin" names the closed kinds, one domain per bolt, increments, the naming registry and every rule as a check.

# Rules
- `cli.json` holds the vocabulary: words, retired words with their replacement, the senses and the closed lists. The CLI's checks read the closed lists (kinds, surfaces, layers); the generated word pages and the tests below read the words.
- `TERM-SYNONYM` (gate) reports, on an added line of a bolt's diff outside the domain docs, a synonym a domain doc's glossary lists. No CLI check reads `vocabulary.retired`: in this repo `tests/words.test.mjs` reports *unit*, *component* and *internal layer* in the CLI's messages, fixes and usage and in the shipped skill, agents, templates and personas, keeping the uses it allows.
- Every tracked text (the docs, README, AGENTS.md, what ships, the CLI's messages and fixes) uses each word in `vocabulary.senses` only after a word naming its sense: architecture, domain, AI, threat, canonical, read or deployment model; the owner's request, else a call; the docs bundle; the API contract; integration, domain or outcome event; C4 component, or a Domain Design, logical or domain component in the method's sense, else domain, or runtime for a deployable; business capability; database, template, API, JSON or doc schema; API or long-running operation. The method's phase keeps its capitalized name, Operation, and stands alone. Code spans, headings, front matter, placeholders, link targets, a word named in italics and a bold defined term are exempt. `tests/senses.mjs` (B255) reports any other bare use.
- **Pinned method.** Approving an intent writes `method: <version>`, a stamp outside the doc's hash, and the intent is judged by that method: one approved before pinning by method 1, a draft by the current one. `method.since` names the method each later rule starts at, by message key; `upgrade` lists the changes (`method.changes`).
- An approved intent's `method/` pages stay at its version ([Docs bundle v2](bundle.md)).

Bolts: [M15](../roadmap/m15.md) B150, B154; [M16](../roadmap/m16.md) B163; [M20](../roadmap/m20.md) B193; [M30](../roadmap/m30.md) B254.
