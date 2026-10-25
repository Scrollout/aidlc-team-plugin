---
type: Design
title: Data ownership
description: Each piece of stored data has one owning module; another module reaches it only through the owner's interface, an event or a shared service, and the merge gate checks it.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T21:00:00Z }
---

# Why
Import boundaries ([Requirements and architecture checks](architecture.md)) stop one slice from importing another's code, but two slices can still query the same table without importing each other. Then a schema change in one breaks the other, and the slices are no longer independent. The owner's rule from the first migration (2026-10-24): one slice never calls another slice's database layer directly; slices talk through well-defined interfaces, events or shared domain services.

# Shape
```json
"modules": [
  { "id": "scope", "paths": ["internal/scope/**"], "data": ["data/regional/scopes", "data/global/scope_types"] }
],
"architecture": {
  "graph": "make deps-graph",
  "data": { "prefix": "data/", "shared": ["data/*/outbox"], "except": ["docs/decisions/0011-data-baseline.md"] }
}
```
- A module's `data` lists the data nodes it owns, as globs. A slice is a module.
- The project's `graph` command prints data edges beside import edges, `<code path> -> <data node>`, e.g. `internal/registry -> data/regional/scopes` for a package whose SQL reads that table. Data nodes start with `architecture.data.prefix`. Finding them is language-specific, so the project's script does it (e.g. table names in a package's SQL); the plugin only reads the edges.
- `shared` lists data no slice owns that every slice may use: infrastructure such as an outbox, audit or idempotency keys. A shared domain service owns its data like any module, and others call it.

# Gate
Checked with the import boundaries on every merge and in `check --ci` (`ARCH-DATA`):
- an edge from a path outside the owning module's `paths` to its data, naming the edge and the owner;
- a data node no module owns and `shared` does not list, so new data gets an owner when it is added;
- a data node two modules claim.

An exception is an approved decision under `architecture.data.except`, listing the `<from> -> <to>` edges it covers, the same as a boundary's `except`: a baseline of known crossings never opens the rule to new ones. Each listed crossing gets a fix unit.

# Card
A unit's card lists the data its modules own and the shared data, and says to reach any other data only through its owner's interface, an event or a shared service, so the builder knows the rule before writing code and every review checks it ([Unit card](unit-card.md)).

# Adoption
The method's default architecture puts this first ([Slice architecture](slice-architecture.md)); `check` fails a profile with modules and no data ownership.
The migration intent `init --adopt` asks for includes data ownership: the owners, the shared list, the data edges in the graph, and a baseline decision for the crossings found.
