---
type: Design
title: Building a slice
description: The vertical slice method from intake to merge - each slice declares its layers, entry, data and integrations in one grammar, and is planned, scaffolded, checked, proved and reported layer by layer.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T06:21:35Z }
---

# Why
A vertical slice is one use case cut through every layer it needs ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md)). Without the layers it needs written down, nothing tells a whole slice from a handler with no screen, no table or no route ([0026](../decisions/0026-a-slice-declares-the-layers-it-needs-and.md)).

# What a slice is
One use case's cut of each horizontal layer it needs, scoped to it alone:
- **Scope:** one command or query, such as creating an order or reading its status; the business capability holding many slices is the domain.
- **Cuts:** one per layer it needs (below), not whole layers: its screen, route, handler, rules, data access or migration, with tests. What all slices share stays in the layers.
- **Whole:** done when every cut it needs is; slices meet only through the shared domain model, domain events or a shared service.

# Layers
- The stack pack lists the layers a slice may cut and where its own code sits in each (`slicePaths`): `ui`, `interface`, `application`, `model`, `infrastructure`, `migration`. A pack names only the layers its stack has. `ui` takes forms, each with its path: `cli`, a command; `web`, a page; `template`, the slice's entry in the declarative template a deployment applies. A slice cuts `ui.<form>`, or `ui` for every form the pack has; a UI on another stack is its own unit of work, consuming the slice's API.
- **Own code** sits under the slice's name: each ui form in `ui/<form>/<slice>/`, its route, input and output types in `interface/<slice>`, its handler and validator in `application/<slice>/`. **Shared:** `model`, `infrastructure`, `migration` (the domain's migrations folder) and the router mounting every route, changed by the slice.
- Surface folders `client/` and `events/` sit beside the layers; `SLICE-PLACE` accepts them.
- Names come from the registry (`aidlc name slice`); paths and layer names are pack data.

# Declared
What a slice reaches beyond its cuts, its data, entry, integrations and permission, is in [What a slice declares](slice-declares.md).

# One grammar
From method 13 a slice carries the same declaration wherever it is written, `(<cut>, …; data <node>, …; entry <runtime>; permission <name>; async; emits <event>, …; consumes <event>, …; calls <target>, …)`, each part after the cuts only where it applies:
- **Domain doc** `# Surface`: `- Command <slice> (…): <use case> [I-<n>:US<g>.<s>]`; `SLICE-SURFACE` checks a line's declaration, and asks for one when a story it cites is of a method 13 intent. An `- Events:` line lists the domain's integration events.
- **Unit of work** `Slices`: `<Kind> <slice> (…) [US<g>.<s>]`, a story served through a screen naming `ui`; `UNIT-WORK` checks the cuts against the pack, the data against the domain's, the entry against the runtimes, the integration events against the surfaces, the calls against the clients and adapters.
- **Architecture model**: `{ kind, verb, useCase, cuts, data, entry, permission, async, emits, consumes, calls }`, its runtimes with what each `applies`, so intake shows the hand-offs between domains; `MODEL-FORMAT` checks them, `models apply` writes them into `# Surface`, `models gaps` lists a missing slice, cut, data, entry or integration.
- **Intake** lists each fitting architecture model's slices with their cuts, so a story is written per use case and per screen.
- **Bolt**: the template's `slices:` names slices of its domain with their cuts; `PLAN-SLICE` holds each to `# Surface` and the bolt's scope to every cut's path.

# Built
- `aidlc scaffold slice` writes a file and a test for each cut with own code, and nothing that exists.
- The card lists each slice the bolt names: the scaffold command, then its cuts as ordered steps, test first, `slicePaths` from the bottom, `migration` up to `ui`, each with its path. The builder scaffolds, then follows them; the reviewer, reading the same card, reports a cut missing or hollow.

# Proved
- `SLICE-DELIVER`: the bolt's diff changes each cut: its own code under the slice's name, a shared layer's folder.
- `SLICE-DATA`: a data edge from a folder of the slice's own code to a node it does not declare; a declared node its domain neither owns nor shares is `SLICE-SURFACE`'s.
- `SLICE-ROUTE`: the runtime a slice names as its entry imports its domain's interface layer; a runtime none of the domain's slices names does not.
- `SLICE-INTEGRATE`: the slice's own code imports another domain's client, an adapter, an extension or a domain's integration events it does not declare, or a declared hand-off its code does not reach, from the pack's graph.
- `SLICE-GOVERN`: no `permission` behind an entry applying a pipeline stage, or a slice importing a stage ([declared](slice-declares.md#governance)).
- `SLICE-TEST`, once a level's `proves` holds `route` or `handoff`: a test at a `route` level names the slice and its `permission`, proving it through its entry and refusing a call without the permission; one at a `handoff` level names each hand-off it declares, a consumer's the publisher too, an `async` slice's a terminal state. The reviewer checks a business rule's refusal test.
- An increment's slices are whole; increment 1's first slice cuts every layer the system's pack has (`INCR-SKELETON`).

# Reported
`status` and the map's `-slices` page show each slice as planned, partial or done, layer by layer, with its hand-offs; an intent's trace lists each of its slices' permission and entry, the permission catalogue; the board's bolt carries each slice's cuts, data, entry and cuts done; the retro counts refusals by layer.

Bolts: [M29](../roadmap/m29.md) B250 to B253.
