---
type: Design
title: Vertical slices checked
description: Deterministic checks that a domain's code is grouped into vertical slices across its horizontal layers - no slice imports another, slices are entered only from the interface layer, every file sits in one layer and one slice, the slice folders match the domain doc's commands and queries, each slice cites the stories it serves and has its own test.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T02:30:00Z }
---

# Why
A vertical slice is the code of one business feature or use case ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)). Unchecked, slices start calling each other, endpoints grow outside any slice, shared code drifts into a slice, and a slice's business reason is lost. Architecture test tools enforce the same shape as rules over the import graph and the folders: slices must not depend on each other, every class must sit in a declared layer, and a rule that matches nothing fails rather than passes. Traceability tools report a link that points nowhere and a requirement nothing covers.

# What a slice is, as data
- A domain holds its slices, each one folder with a sub-folder per layer it cuts, `<domain>/<slice>/<layer>/`, beside the domain's shared parts: its domain model, `infrastructure/`, its `client/` and `events/` surfaces and the router in `interface/` ([0029](../decisions/0029-a-slice-holds-its-own-layers.md)). The stack pack's `sliceFolder`, `slicePaths` and `layers` say where, and its `scaffold.slice` writes it.
- The domain doc's `# Surface` lists each slice on its own line: `- Command <slice>: <the use case it serves> [I-<n>:US<g>.<s>]`, or `- Query`. The story citation names the intent, since story ids are an intent's own.
- The patterns, the folder names and the allowed shared folders are data in the pack and the stacks CLI extension; nothing is spelled in code ([Values as data](values.md)).

# Checks
Each is static and reads the graph the pack already builds; which layers may enter a slice is data in the stacks CLI extension.
- `SLICE-IMPORT`: a file of one slice imports a file of another slice of any domain.
- `SLICE-ENTRY`: a slice is imported from outside its domain's `interface` layer or a runtime that hosts it, or from nowhere.
- `SLICE-PLACE`: a file of a layered domain sits in no shared part and in no layer folder of a slice, or a slice folder or a shared layer folder is empty.
- `SLICE-SURFACE`: the slice folders and the domain doc's commands and queries are not the same set, or a surface line names no use case.
- `SLICE-STORY`: a surface line cites no story, or one no intent holds; a story of an approved intent's unit of work that changes the domain is cited by no slice.
- `SLICE-TEST`: no test sits in the slice's folder and none imports it.

With a naming registry, the slice's name and its route:
- `SLICE-NAME`: a slice folder that is no name the registry composes from one of its verbs and the domain's noun (`aidlc name slice`).
- `SLICE-ROUTE`: an API operation id used twice in the API contracts, one that maps to no slice folder, or a slice of a domain the API contracts serve that no API operation maps to. An API operation id maps to the slice the registry composes from the same domain and verb.
- `SLICE-DELIVER`: a bolt that adds a slice changes no file of its domain's interface layer or of a runtime, which wire its route, or not the domain doc, which lists it.

# Planned before built
The chain story → slice → folder → test starts where the story is written, in the same grammar as the checks above.
- **Units of work** (method 12): each Unit names the slices it delivers under `Slices`, one `<Kind> <slice> [US<g>.<s>]` each, so every story of the Unit has a slice before any bolt is cut; a Unit with no domain module is horizontal work (a foundation kit, a pipeline stage, the toolchain), whose stories no slice serves, and writes `Slices: none: <why>`. `UNIT-WORK` reports a story no slice serves, a slice citing no story of the Unit, a kind other than Command or Query, and, with a naming registry, a name the registry does not compose from one of its verbs and a domain of the Unit's modules ([Units of work](units-of-work.md)).
- **Architecture models:** an architecture model's domains and its extension module list their slices as `{ kind, verb, useCase }`, the registry composing each name from the verb and the domain's noun. `models apply` writes each domain doc the docs bundle lacks with its `# Surface`, the stories left for elaboration to cite, and prints the increments slice by slice; `models gaps` lists a domain's slices in the architecture model that its doc does not list ([Architecture models](models.md)).
- **Intake** lists a fitting architecture model's slices beside it, so stories are written per use case ([Intake](intake.md)).
- **Bolts** list the slices they deliver; `PLAN-SLICE` holds each to its domain doc and `SLICE-DELIVER` to the bolt's diff, and the board labels a bolt `slice:<name>`, or `layer:<kind>` when it binds a horizontal module ([Board](board.md#shape)).

# Where they run
At the merge gate, on the merge result. A project's existing code is measured as it changes: a finding counts only where the bolt changed a file, the slice folder or the domain doc it names, so debt from before adoption waits for the bolt that touches it.

How a slice is built whole, layer by layer: [Building a slice](slice-method.md).

Bolts: [M27](../roadmap/m27.md) B245, B246; [M28](../roadmap/m28.md) B247, B248, B249.
