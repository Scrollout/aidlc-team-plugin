---
type: Design
title: Architecture model
description: Draft - the system's core and extensions, seven closed module kinds with what each may depend on, four inward-pointing layers, client, server and event surfaces, and data owned by one domain; boundaries are computed from these declarations, never written by hand.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Why
On `resource-manager` the profile could say only "module with layers":
- The map drew `toolchain` and `deploy` as vertical slices.
- Nothing kept the layers pointing inward.
- The front door linked the registry's internals through a package that held both its client and server, and every check passed.

The core-versus-provider shape was the reason the project exists, yet it had nowhere to be declared ([0013](../decisions/0013-a-deterministic-ai-dlc.md)).

# Profile
```json
"system": { "core": ["internal/**", "cmd/**"], "extensions": ["extensions/**"] },
"modules": [{ "id": "providers", "kind": "domain", "paths": ["internal/domains/providers/**"],
  "layers": { "interface": [...], "application": [...], "model": [...], "infrastructure": [...] },
  "surfaces": { "client": ["internal/domains/providers/client"], "server": ["internal/domains/providers/interface"], "events": ["internal/domains/providers/events"] },
  "data": ["data/providers/**"] }]
```

# Kinds
A module without a kind, an unknown kind or surface, or a malformed `system` is `PROFILE-KIND`: an error once the profile has `system` (v2), a warning on a v1 profile until it migrates. `upgrade` proposes a kind per module from its id and paths (`vocabulary.kindHints`) and changes nothing.

| Kind | Owns data | May depend on |
|---|---|---|
| `domain` | its schema | its own layers; `foundation`; other domains' `client` and `events` |
| `pipeline` (request-path stage) | read models fed by events only | `foundation`; domains' `client` and `events` |
| `foundation` (shared kit) | nothing | lower `foundation` kits, acyclic |
| `adapter` (anticorruption layer) | nothing | `foundation`; the external SDK |
| `runtime` (composition root) | nothing | the core modules it hosts |
| `extension` | its own | published contracts only |
| `delivery` (build, deploy, tooling) | nothing | nothing in product code |

**Always:**
- the core never depends on an extension;
- a slice never imports another slice;
- nothing in product code imports `delivery`.

# Layers
Inside a module that declares them, layers point inward: `interface → application → model` and `infrastructure → model`. `model` imports only `foundation`. Slices live in `application`. A stack pack maps the four layers to folder names (M17).

# Surfaces and data
- Another module may import only a module's `client` or `events`. `server` is for the runtime that hosts it.
- Each data node has one owning domain. Only its `infrastructure` layer touches it, and a pipeline may own only event-fed read models.
- A transaction never spans two domains' data (`DESIGN-COHERENCE`, M18).

# Checks
| Code | Milestone | What it reports |
|---|---|---|
| `PROFILE-KIND` | M15 | a module without a kind, or an unknown one |
| `ARCH-KIND` | M17 | an edge the kind table forbids |
| `ARCH-LAYER` | M17 | an outward layer edge |
| `ARCH-API` | M17 | an import outside `client` or `events` |
| `ARCH-REACH` | M17 | a runtime's transitive closure reaching internals of a domain it does not host |
| `ARCH-DATA`, `ARCH-CYCLE` | existing | as today |

All of them run at every gate on the merged tree. A project writes only exceptions, each an owner-approved decision listing its edges.

# Replaces
- `slice-architecture.md`, `module-surface.md` and `data-ownership.md` fold into this doc.
- Hand-written `architecture.boundaries` remain only as `except` lists.

Bolts: [M15](../roadmap/m15.md) B151, B155; still to build: [M17](../roadmap/m17.md) B166 to B170.
