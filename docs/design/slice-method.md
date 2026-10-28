---
type: Design
title: Building a slice
description: Draft - the vertical slice method from intake to merge - each slice declares its layers, entry, data and integrations in one grammar, and is planned, scaffolded, checked, proved and reported layer by layer.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T06:21:35Z }
---

# Why
A vertical slice is one use case cut through every layer it needs ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)). Without the layers it needs written down, nothing tells a whole slice from a handler with no screen, no table or no route ([0026](../decisions/0026-a-slice-declares-the-layers-it-needs-and.md)).

# What a slice is
The parts of each horizontal layer that one use case needs, scoped to that use case alone:
- **Scope:** one command or query, such as creating an order or reading its status; the capability holding many slices is the domain.
- **Cuts:** not whole layers but its cut of each: screen, route, handler, rule, data access, migration and test. What all slices share stays in the layers.
- **Whole:** done when every cut it needs is; slices meet only through the shared model, events or a shared service.

# Layers
- The stack pack lists the layers a slice may cut and where its own code sits in each (`slicePaths`): `ui`, `interface`, `application`, `model`, `infrastructure`, `migration`. A pack names only the layers its stack has. `ui` takes forms, each with its path: `cli`, a command; `web`, a page; `template`, the slice's entry in the declarative template a deployment applies. A slice cuts `ui.<form>`, or `ui` for every form the pack has; a UI on another stack is a Unit of its own, consuming the slice's API.
- **Own code** sits under the slice's name: each ui form in `ui/<form>/<slice>/`, its route and request and response types in `interface/<slice>`, its handler and validator in `application/<slice>/`. **Shared:** `model`, `infrastructure`, `migration` (the domain's migrations folder) and the router mounting every route, changed by the slice.
- The surface folders `client/` and `events/` sit beside the layers, and `SLICE-PLACE` accepts them.
- Names come from the registry (`aidlc name slice`); paths and layer names are pack data.

# Declared
What a slice reaches beyond its cuts, its data, entry, integrations and permission, is in [What a slice declares](slice-declares.md).

# One grammar
From method 13 a slice carries the same declaration wherever it is written, `(<cut>, …; data <node>, …; entry <runtime>; permission <name>; async; emits <event>, …; consumes <event>, …; calls <target>, …)`, each part after the cuts only where it applies:
- **Domain doc** `# Surface`: `- Command <slice> (…): <use case> [I-<n>:US<g>.<s>]`; `SLICE-SURFACE` checks a line's declaration, and asks for one when a story it cites is of a method 13 intent. An `- Events:` line lists the domain's events.
- **Unit of work** `Slices`: `<Kind> <slice> (…) [US<g>.<s>]`, a story served through a screen naming `ui`; `UNIT-WORK` checks the cuts against the pack, the data against the domain's, the entry against the runtimes, the events against the surfaces and the calls against the clients and adapters.
- **Model**: `{ kind, verb, useCase, cuts, data, entry, permission, async, emits, consumes, calls }`, its runtimes with what each `applies`, so intake shows the hand-offs between domains; `MODEL-FORMAT` checks them, `models apply` writes them into `# Surface`, `models gaps` lists a missing slice, cut, data, entry or integration.
- **Intake** lists each fitting model's slices with their cuts, so a story is written per use case and per screen.
- **Bolt**: the template's `slices:` names slices of its domain with their cuts; `PLAN-SLICE` holds each to `# Surface` and the bolt's scope to every cut's path.

# Built
- `aidlc scaffold slice` writes a file and a test for each cut with own code, and nothing that exists.
- The card lists each slice the bolt names: the scaffold command, then its cuts as ordered steps, test first, the pack's `slicePaths` read from the bottom, `migration` up to `ui`, each with its path. The builder scaffolds, then follows them; the reviewer, reading the same card, reports a cut missing or hollow.

# Proved
- `SLICE-DELIVER`: the bolt's diff changes each cut: its own code under the slice's name, a shared layer's folder.
- `SLICE-DATA`: a data edge from a folder of the slice's own code to a node it does not declare; a declared node its domain neither owns nor shares is `SLICE-SURFACE`'s.
- `SLICE-ROUTE`: the runtime a slice names as its entry imports its domain's interface layer; a runtime none of the domain's slices names does not.
- `SLICE-INTEGRATE`: the slice's own code imports another domain's client, an adapter, an extension or a domain's events it does not declare, or a declared call or event its code does not reach, from the pack's graph.
- `SLICE-GOVERN`: no `permission` behind an entry applying a pipeline stage, or a slice importing a stage ([declared](slice-declares.md#governance)).
- `SLICE-TEST`, once a level's `proves` holds `route` or `handoff`: a test at a `route` level names the slice and its `permission`, proving it through its entry and refusing a request without the permission; one at a `handoff` level names each event and call it declares, a consumer's the publisher too, an `async` slice's a terminal state. The reviewer checks a business rule's refusal test.
- An increment's slices are whole; increment 1's first slice cuts every layer the system's pack has (`INCR-SKELETON`).

# Reported
`status`, `next`, the codebase map and the trace show the hand-offs between slices across domains, and each slice of a domain as planned, partial or done, layer by layer, from story to file; the board's bolt carries each slice's cuts, data and entry, and a field counting its cuts done; the retro counts refusals by layer.

Bolts: [M29](../roadmap/m29.md) B250 to B253.
