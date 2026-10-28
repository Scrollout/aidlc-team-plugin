---
type: Design
title: Building a slice
description: Draft - the vertical slice method from intake to merge - each slice declares the layers its use case needs, its entry, the data of its domain it uses and how it integrates, carried by one grammar through intake, models, Units of work, the domain doc and the bolt, scaffolded and planned layer by layer, refused at the gate when a declared layer is missing, proved through its route and reported layer by layer.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T06:21:35Z }
---

# Why
A vertical slice is one use case cut through every layer it needs ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)). Without the layers it needs written down, nothing tells a whole slice from a handler with no screen, no table or no route ([0026](../decisions/0026-a-slice-declares-the-layers-it-needs-and.md)).

# Layers
- The stack pack lists the layers a slice may declare and where each one's part sits (`sliceLayers`): `ui`, `interface`, `application`, `model`, `infrastructure`, `schema`. A pack names only the layers its stack has: `ui` where it serves a front end.
- **Own parts** sit under the slice's name: `ui/<slice>/`, `application/<slice>/`, the migration `<n>_<slice>`. **Shared layers** (`interface`, `model`, `infrastructure`) are the domain's folders, changed by the slice.
- Names come from the registry (`aidlc name slice`); paths and layer names are pack data.

# Data and entry
- **Data** stays the domain's ([Data ownership](data-ownership.md)): several slices use it, such as one that creates a store and one that writes into it. A slice declares the data nodes of its domain it reads or writes.
- **Entry:** the runtime or endpoint that serves the slice, one of the entries the profile or the model defines (`entries`, each with its runtime and what it applies, such as authorization). The plugin names none.

# Integration
- **Mode:** `sync` answers in the request; `async` accepts it and answers through a status contract that ends in a terminal state.
- **Events:** `emits` names the business facts the slice publishes, past tense and versioned, in its domain's `events` surface; `consumes` names events it reacts to, each in its publisher's surface. The publisher owns the event's contract.
- **Calls:** `calls` names the other domains' `client`s and the adapters it uses.
- **From the entry:** an entry may define what it adds to every slice it serves (`entries[].adds`): an outcome event per operation, the status contract of `async`, the operation's name as its authorization action. A slice served by it gets them without declaring them.

# One grammar
From method 13 a slice carries its layers, data and entry wherever it is written, as `(<layer>, …; data <node>, …; entry <entry>; mode <mode>; emits <event>, …; consumes <event>, …; calls <target>, …)`, the integration parts only where they apply:
- **Domain doc** `# Surface`: `- Command <slice> (…): <use case> [I-<n>:US<g>.<s>]`.
- **Unit of work** `Slices`: `<Kind> <slice> (…) [US<g>.<s>]`; `UNIT-WORK` checks the layers against the pack, the data against the domain's, the entry against `entries`, the events against the surfaces and the calls against the clients and adapters.
- **Model**: `{ kind, verb, useCase, layers, data, entry, mode, emits, consumes, calls }`, and its `entries`, so intake shows the hand-offs between domains; `MODEL-FORMAT` checks them, `models apply` writes them into `# Surface`, `models gaps` lists a missing slice or layer.
- **Intake** lists each fitting model's slices with their layers, so a story is written per use case and per screen.
- **Bolt**: `slices:` names slices of its domain; `PLAN-SLICE` holds each to `# Surface` and the bolt's scope to every declared layer's path.

# Built
- `aidlc scaffold slice` writes a file and a test for each declared own part, and nothing that exists.
- The card lists the slice's layers as ordered steps, test first, from `schema` up to `ui`; the builder scaffolds, then follows them. The reviewer reports a declared layer missing or hollow.

# Proved
- `SLICE-DELIVER`: the bolt's diff changes each declared layer: an own part under the slice's name, a shared layer's folder.
- `SLICE-DATA`: a data edge from the slice's code to a node it does not declare, or a declared node its domain neither owns nor shares.
- `SLICE-ROUTE`: the slice's route is wired in the runtime of its entry.
- `SLICE-INTEGRATE`: the slice's code imports another domain's client, an adapter or an event type it does not declare, or a declared integration its code does not reach, read from the pack's graph.
- Each declared event and call has a test at a level marked `integration` that names it; a consumer's test names the publisher; an `async` slice's test follows the status to a terminal state.
- `SLICE-TEST`: a test at a level marked `entry` in the profile names the slice's route, so the slice is proved through its entry, not by its handler alone.
- An increment's slices are whole; increment 1's first slice declares every layer the system's pack has (`INCR-SKELETON`).

# Reported
`status`, `next`, the codebase map and the trace show the hand-offs between slices across domains, and each slice of a domain as planned, partial or done, layer by layer, from story to file; the board lists a slice's layers, data and entry on its bolt; the retro counts refusals by layer.

Bolts: [M29](../roadmap/m29.md) B250 to B253.
