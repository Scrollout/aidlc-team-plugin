---
type: Design
title: Vertical slices checked
description: Draft - deterministic checks that a domain's code is grouped into vertical slices across its horizontal layers - no slice imports another, slices are entered only from the interface layer, every file sits in one layer and one slice, the slice folders match the domain doc's commands and queries, each slice cites the stories it serves and has its own test.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T02:30:00Z }
---

# Why
A vertical slice is the code of one business feature or use case ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)). Unchecked, slices start calling each other, endpoints grow outside any slice, shared code drifts into a slice, and a slice's business reason is lost. Architecture test tools enforce the same shape as rules over the import graph and the folders: slices must not depend on each other, every class must sit in a declared layer, and a rule that matches nothing fails rather than passes. Traceability tools report a link that points nowhere and a requirement nothing covers.

# What a slice is, as data
- The stack pack's `layers` name the folders of a domain's horizontal layers, and its `scaffold.slice` the slice folder: `<domain>/<application>/<slice>/`.
- The domain doc's `# Surface` lists each slice: `- Commands: <slice>: <the use case it serves> [I-<n>:US<g>.<s>]`. The story citation names the intent, since story ids are an intent's own.
- The patterns, the folder names and the allowed shared folders are data in the pack and the extension; nothing is spelled in code ([Values as data](values.md)).

# Checks
Each is static, reads the graph the pack already builds, and fails on an empty match.
- `SLICE-IMPORT`: a file of one slice imports a file of another slice of any domain.
- `SLICE-ENTRY`: a slice is imported from outside its domain's `interface` layer or a declared event consumer, or from nowhere.
- `SLICE-PLACE`: a file of a layered domain sits in no declared layer, a file under `application` in no slice, or a declared layer or slice folder is empty.
- `SLICE-SURFACE`: the slice folders and the domain doc's commands and queries are not the same set, or a surface line names no use case.
- `SLICE-STORY`: a surface line cites no story, or one no intent holds; a story of an approved intent's unit of work that changes the domain is cited by no slice.
- `SLICE-TEST`: no test file imports the slice's entry.

Later, in their own bolt: a slice name that is not a verb and a noun from the naming registry; every route mapped to exactly one slice through a unique operation id equal to its name; a bolt that adds a slice also adding its route, its test and its surface line.

# Adoption
A project's existing violations are frozen when it adopts the checks, as architecture boundaries are, so only new ones are reported ([Architecture model](architecture-model.md)).

Bolts: [M27](../roadmap/m27.md) B245, B246.
