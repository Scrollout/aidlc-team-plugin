---
type: Design
title: Module surfaces and cycles
description: A module other modules may reach only through the public paths it declares, and modules that never depend on each other in a circle, both checked at merge.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T21:40:00Z }
---

# Why
A domain owns its data ([Data ownership](data-ownership.md)) and also its code: another module calls it through a public interface, never its internals, and two modules that depend on each other in a circle are no longer separate. Both are the rest of the hybrid of domains with layers inside each that the owner asked for on the first migration (2026-10-24). Layers inside a domain need no new rule: once a domain keeps its layers in their own folders (e.g. `api/`, `app/`, `domain/`, `store/`), [boundaries](architecture.md#architecture-rules) with a `*` per domain deny the wrong direction, e.g. `{ "from": "internal/*/domain/**", "deny": ["internal/*/store/**", "internal/*/api/**"] }`.

# Public surface
```json
"modules": [
  { "id": "scope", "paths": ["internal/scope/**"], "api": ["internal/scope", "internal/scope/events/**"] }
],
"architecture": { "graph": "make deps-graph", "api": { "except": ["docs/decisions/0012-surface-baseline.md"] } }
```
- A module's `api` lists the paths other modules may depend on, as globs. A module without `api` is not checked, so a project opts in module by module.
- `ARCH-API`: an edge of the graph from one module to a path of another module outside that module's `api`, naming the edge and the public paths. Edges inside a module and edges to paths in no module pass.
- Go projects can also put a module's internals under `<module>/internal/`, which the compiler enforces; `api` states the same rule for the gate in any language.
- **Surfaces (v2, B168).** A module may declare `surfaces`: `client` and `events` are its public paths, `server` is for the runtime that hosts it. With surfaces, `client` and `events` replace `api`. When both ends of an edge have a kind, the kind table decides instead (`ARCH-KIND`), and a runtime may link only the surfaces of a domain it does not host (`ARCH-REACH`) ([Architecture model](architecture-model.md#checks)).

# Cycles
`"architecture": { "acyclic": true }` (or `{ "except": [...] }`) turns on `ARCH-CYCLE`: the graph's edges between modules, read as module to module, must form no circle. The finding names one circle, e.g. `scope -> registry -> scope`, once per set of modules.

# Exceptions
`architecture.api.except` and `architecture.acyclic.except` are approved decisions like a boundary's `except` ([Requirements and architecture checks](architecture.md#architecture-rules)): the API decision lists `<from> -> <to>` path edges, the cycle decision lists module edges `<module> -> <module>`, which are left out before circles are looked for. A baseline lists the edges found when the rule is turned on, each with a fix bolt, and never covers a new one.
