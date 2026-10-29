---
type: Design
title: Architecture model
description: The system's core and extensions, seven closed module kinds with what each may depend on, five horizontal layers pointing inward, client, server and event surfaces, and data owned by one domain; boundaries are computed from these declarations, never written by hand.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Why
A profile that can say only "module with layers" lets the shape go wrong while every check passes:
- The map draws tooling and deployment as vertical modules beside the domains.
- Nothing keeps the layers pointing inward.
- One module reaches another's internals through a package that holds both its client and server.

A core-versus-provider shape, often the reason a system exists, has nowhere to be declared ([0013](../decisions/0013-a-deterministic-ai-dlc.md)).

# Profile
```json
"system": { "core": ["internal/**", "cmd/**"], "extensions": ["extensions/**"] },
"modules": [{ "id": "providers", "kind": "domain", "paths": ["internal/domains/providers/**"],
  "layers": { "interface": [...], "application": [...], "model": [...], "infrastructure": [...] },
  "surfaces": { "client": ["internal/domains/providers/client"], "server": ["internal/domains/providers/interface"], "events": ["internal/domains/providers/events"] },
  "data": ["data/providers/**"] }]
```

# Kinds
The matrix and the layers, generated: [Kinds and layers](diagrams/kinds.md).
A module without a kind, an unknown kind or surface, or a malformed `system` is `PROFILE-KIND`: an error once the profile has `system` (v2), a warning on a v1 profile until it migrates. `upgrade` proposes a kind per module from its id and paths (`vocabulary.kindHints`) and changes nothing.

| Kind | Owns data | May depend on |
|---|---|---|
| `domain` | its database schema | its own layers; `foundation`; other domains' `client` and `events` |
| `pipeline` (a stage every call crosses) | read models fed by integration events only | `foundation`; domains' `client` and `events` |
| `foundation` (shared kit) | nothing | lower `foundation` kits, acyclic |
| `adapter` (anticorruption layer) | nothing | `foundation`; the external SDK |
| `runtime` (composition root) | nothing | the core modules it hosts |
| `extension` | its own | `foundation`; published API contracts only: domains' `client` and `events` |
| `delivery` (build, deploy, tooling) | nothing | nothing in product code |

**Always:**
- the core never depends on an extension;
- a vertical slice never imports another slice;
- nothing in product code imports `delivery`.

# Layers
Inside a domain that declares them, its horizontal layers point inward (`vocabulary.layerRules`): `interface → application → model`, `interface → model` and `infrastructure → model`; `ui` and `model` import no other layer. `model` imports only `foundation`. A stack pack maps the five layers, `ui`, `interface`, `application`, `model` and `infrastructure`, to folder names (`layers`, M17), and its `slicePaths` place each vertical slice's own code in them, with the domain's `migration` folder as one more cut ([Building a slice](slice-method.md#layers)). A slice reaches the other layers through the domain's ports.

# Surfaces and data
- Another module may import only a module's `client` or `events`. `server` is for the runtime that hosts it.
- Each data node has one owning domain. Only its `infrastructure` layer touches it, and a pipeline may own only event-fed read models.
- A transaction never spans two domains' data (`DESIGN-COHERENCE`, M18).

# Checks
| Code | Milestone | What it reports |
|---|---|---|
| `PROFILE-KIND` | M15 | a module without a kind, or an unknown one |
| `ARCH-KIND` | M17 B166 | an edge the kind table forbids (`vocabulary.kindRules`) |
| `ARCH-LAYER` | M17 B167 | an outward layer edge, or a domain model depending on anything but a foundation kit; v1 names read as the pack's layers (`vocabulary.layerAliases`: `web` and `frontend` as `ui`, `api`, `app`, `domain`, `store`) |
| `ARCH-API` | M17 B168 | an import outside a module's surface (`client` and `events`, or a v1 `api`), when either end has no kind; with kinds on both ends `ARCH-KIND` decides |
| `ARCH-REACH` | M17 B169 | a runtime reaching, through anything it links, internals of a domain it does not host (it hosts the domains it imports beyond their surfaces) |
| `ARCH-DATA`, `ARCH-CYCLE` | existing | as today |

All of them run at every gate on the merged tree. A project writes only exceptions, each an owner-approved decision listing its edges (`- <from> -> <to>`), named under the rule's `except`: a boundary's, `architecture.data`, `api`, `acyclic`, and `kinds` for `ARCH-KIND` and `ARCH-REACH`, whose walk does not cross an excepted edge.

# Profile check
With `modules` in the profile, `check` reports `PROFILE-ARCH`: an error when data ownership is off (no `architecture.data`, so the gate cannot see a domain reaching another's data), a warning in an adopted project until the migration intent sets the owners ([Data ownership](data-ownership.md#adoption)); a warning when `architecture.acyclic` is off or a module has no `api`.

# Constitution
`init` writes rule 9, vertical slices across horizontal layers: code grouped by use case into slices cutting the layers they need, slices meeting only through published interfaces, integration events or shared domain services, each domain owning its data, language and API contract with its layers pointing inward, no dependency cycle, and the checks that hold it.

# Replaces
- The slice-architecture doc folded into this doc (B159). [Module surfaces](module-surface.md) and [Data ownership](data-ownership.md) stay as the detail docs of `ARCH-API`, `ARCH-CYCLE` and `ARCH-DATA`: folding them in would pass the doc's cap.
- Hand-written `architecture.boundaries` remain only as `except` lists.

Bolts: [M15](../roadmap/m15.md) B151, B155; [M17](../roadmap/m17.md) B166 to B172 ([Stack packs](stack-packs.md)).
