---
type: Design
title: System words
description: The canonical words at the system scale, each with its one meaning, the AI-DLC term it maps to and where it is declared; drawn from the vocabulary in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|
| horizontal layer | code grouped by one technical concern, shared by every feature: the layers inside a domain, pointing inward, and the platform every call crosses | logical design | the stack pack's layers; module `kind: runtime`, `pipeline`, `foundation` or `adapter` |
| core | the platform layers and the shared domains every domain uses | the system | profile `system.core` |
| extension | a domain another team owns, built only against published API contracts | another team's Units | profile `system.extensions` |
| module | a folder of code with one kind, its paths, the data it owns and its surfaces | - | profile `modules[]` |
| runtime | a deployable that hosts domains and serves their slices: the entry | - | module `kind: runtime` |
| pipeline | a governance stage every call crosses, in order | - | module `kind: pipeline` |
| foundation | a shared kit with no business rules | - | module `kind: foundation` |
| adapter | the code that speaks to one outside system, its anticorruption layer | - | module `kind: adapter` |
| delivery | what builds and deploys the system; no product code imports it | - | module `kind: delivery` |
| architecture model | a reference architecture as data: its layers, domains, extension, API contracts and rules | - | `.aidlc/models/<name>/model.json` |
| stack pack | a language's layout, scaffold templates, reference domain and import graph | - | `plugin/packs/<stack>/` |
| naming registry | the grammar and vocabularies every name is composed from | - | profile `naming` |
| profile | the project's settings, in layers the CLI merges | - | `.aidlc/profile.json` |
