---
type: Decision
title: 0024 Vertical slices are features, horizontal layers are technical concerns
description: A vertical slice groups the code of one business feature or use case and cuts through every horizontal layer it needs; a horizontal layer groups code by one technical concern shared by every feature; a domain is the bounded context that holds a business capability's slices and its data.
status: accepted
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
supersedes: "0023"
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T00:30:00Z }
sources:
  - id: features
    resource: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/develop-asp-net-core-mvc-apps
    title: Developing ASP.NET Core MVC apps, feature organization
  - id: handlers
    resource: https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/microservice-application-layer-implementation-web-api
    title: Implementing the microservice application layer using the Web API
  - id: layering
    resource: https://martinfowler.com/bliki/PresentationDomainDataLayering.html
    title: Presentation Domain Data Layering
  - id: method
    resource: https://prod.d13rzhkk8cj2z0.amplifyapp.com/aidlc.pdf
    title: AI-DLC Method Definition
---

# Vertical slices are features, horizontal layers are technical concerns

## Context and Problem Statement
Horizontal layers group code by technical concern: the interface, the business logic, the data. Horizontal development builds an application layer by layer across all its features. Vertical slices group code by business feature or use case, each cutting through every layer it needs; vertical slice development builds the application feature by feature, top to bottom;[^features] each command has its own handler, the domain logic staying in the domain.[^handlers] Layering practice puts these layers inside domain-oriented modules,[^layering] and the method splits an intent into Units of cohesive user stories, each built by one team.[^method]

[0023](0023-words-follow-the-method-and-the-reference.md) gave "vertical slice" to a whole domain, called one feature an "operation", and kept the interface, application, model and infrastructure layers apart from the horizontal layers under the name "internal layer". So the plugin's words did not say what a slice or a layer is by the standard definitions.

## Considered Options
1. Keep 0023's words.
2. **Use the standard definitions of vertical slices and horizontal layers.**

## Decision Outcome
Chosen option: "Use the standard definitions of vertical slices and horizontal layers", because a slice then states the business feature or use case it serves, and a layer the technical concern it holds:
- **vertical slice:** the code of one business feature or use case, a command or a query, in its own folder, cutting through every horizontal layer it needs. It names the use case it serves: the why from the business side.
- **horizontal layer:** code grouped by one technical concern and shared by every feature: `interface`, `application`, `model` and `infrastructure` inside a domain, pointing inward; and the platform every request crosses, as the module kinds `runtime` (the entry), `pipeline` (a governance stage), `foundation` (a shared kit) and `adapter`.
- **domain:** a bounded context holding the vertical slices of one business capability, with its data, language, contract and events.
- **extension:** a domain another team owns, built only against published contracts.
- **core:** the platform layers and the shared domains every domain uses.
- **Retired:** "operation" for one command or query, now vertical slice; "internal layer", now horizontal layer.
- **Delivery:** the plugin plans vertical slice development. Each increment delivers whole slices end to end, the walking skeleton first.

### Consequences
- Good, because a slice and a layer mean what the standard definitions say, and every slice carries its business why.
- Bad, because `aidlc name` and `aidlc scaffold` take `slice` again, and a model's vertical contract is named after the extensions that declare it.

### Confirmation
The glossary is generated from `cli.json`; a test fails on shipped text that uses a retired word.

[^features]: Developing ASP.NET Core MVC apps, feature organization
[^handlers]: Implementing the microservice application layer using the Web API
[^layering]: Presentation Domain Data Layering
[^method]: AI-DLC Method Definition
