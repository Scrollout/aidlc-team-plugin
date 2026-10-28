---
type: Decision
title: 0023 Words follow the method and the reference architecture
description: The plugin's architecture words come from the method and the reference architecture - vertical slices that own their data and horizontal layers built once for every slice, with domains and extensions as the vertical kinds, an operation for one command or query, and internal layers inside a slice.
status: superseded by ADR-0024
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T23:30:00Z }
sources:
  - id: method
    resource: https://prod.d13rzhkk8cj2z0.amplifyapp.com/aidlc.pdf
    title: AI-DLC Method Definition
  - id: layering
    resource: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice
    title: Designing a DDD-oriented microservice
  - id: features
    resource: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/develop-asp-net-core-mvc-apps
    title: Developing ASP.NET Core MVC apps, feature organization
---

# Words follow the method and the reference architecture

## Context and Problem Statement
The reference architecture has two axes. Horizontal layers are built once and serve every request: the entry, the governance stages, the shared platform. Vertical slices are owned by one team each, own their state, and plug into the horizontal layers through a contract. The method forms its Units the same way, as independent, loosely coupled bounded contexts, each built by one team down its own column from domain design to deployment.[^method] Layering practice keeps layers inside domain-oriented modules, not at the top level.[^layering]

[0013](0013-a-deterministic-ai-dlc.md) gave the plugin one word per concept but named neither axis. It used "slice" for one command or query, the sense of a code-organisation style,[^features] while the architecture and the method use the vertical slice for the whole bounded context. It also used "layer" only for the rings inside a module. A project's architecture could then not be stated in the plugin's words. This decision replaces 0013's architecture words; the rest of 0013 stands.

## Considered Options
1. Keep 0013's words.
2. **Take the words from the method and the reference architecture.**

## Decision Outcome
Chosen option: "Take the words from the method and the reference architecture", because the plugin then states and checks a project's architecture in the terms its sources define:
- **vertical slice:** a part of the system that owns its data end to end, built by one team and plugged into the horizontal layers through its contract. Its kinds are `domain`, one bounded context and the method's Unit, and `extension`, a slice another team owns.
- **horizontal layer:** a part every request crosses, built once for every slice. Its kinds are `runtime`, the entry; `pipeline`, a governance stage; `foundation`, a shared kit; and `adapter`.
- **core:** the horizontal layers and the shared domains every slice uses.
- **operation:** one command or query of a slice, in its own folder.
- **internal layer:** `interface`, `application`, `model` or `infrastructure` inside a slice, pointing inward.
- **Retired:** "slice" for one operation, which becomes operation. Shipped text writes "vertical slice" in full.

### Consequences
- Good, because the glossary, the models, the reference code and the checks use the same words as the sources.
- Bad, because `aidlc name` and `aidlc scaffold` take `operation` where they took `slice`.

### Confirmation
The glossary is generated from `cli.json`, and a test fails on shipped text that writes "slices" without "vertical".

[^method]: AI-DLC Method Definition
[^layering]: Designing a DDD-oriented microservice
[^features]: Developing ASP.NET Core MVC apps, feature organization
