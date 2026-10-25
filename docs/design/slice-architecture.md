---
type: Design
title: Slice architecture
description: The architecture the method sets for every project - vertical slices as bounded contexts with inward-pointing layers, each owning its data, talking through published interfaces and events, with no cycles - and the merge checks that act as its fitness functions.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T16:00:00Z }
---

# Why
The owner set it on the first migration and asked for it in every project (2026-10-25): "One slice never directly calls the internal database layer of another slice. If slices need to communicate, they do so through well-defined interfaces, events, or shared domain services." Data ownership is the critical part: once two slices share tables, a schema change in one breaks the other and the slices can no longer change, scale or be replaced on their own, for the rest of the codebase's life.

# Terms
| Rule | Term | Check |
|---|---|---|
| A capability end to end in one module | vertical slice, a bounded context | `modules` |
| Layers inside a slice point inward only (api, app, domain; store an adapter) | clean / hexagonal architecture, the dependency rule | `architecture.boundaries` with a `*` per slice |
| A slice owns its data; no other slice reads or writes it | data ownership, database per service | `ARCH-DATA` ([Data ownership](data-ownership.md)) |
| Other slices use only its declared surface or its events | published interface, integration events | `ARCH-API` ([Module surfaces and cycles](module-surface.md)) |
| No circle of dependencies between slices | acyclic dependencies principle | `ARCH-CYCLE` |
| The checks run on every merge | architecture fitness functions | the [merge gate](gate.md) |

One deployable holding the slices is a modular monolith; slices shipped as their own containers are microservices. The rules are the same, so a project can move between them.

# Profile check
With `modules` in the profile, `check` reports `PROFILE-ARCH`:
- **error** when data ownership is off: no `architecture.data`, so the gate cannot see a slice reaching another's data. In an adopted project (`adopted` set) it is a warning until the migration intent sets the owners, since the base must keep merging meanwhile ([Data ownership](data-ownership.md#adoption)).
- **warning** when `architecture.acyclic` is off, or a module has no `api`.

# Constitution
`init` writes rule 9, the owner's sentence word for word, with the checks that hold it.
