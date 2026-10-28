---
type: Decision
title: 0026 A slice declares the layers it needs and delivers them whole
description: A vertical slice names the horizontal layers its use case needs, from the user interface to the migration, the entry that serves it, the data of its domain it uses, how it integrates and the permission it needs; its own parts sit under its name, the shared layers stay shared and the data stays the domain's; it is planned, built, checked and reported layer by layer, and merges only whole.
status: accepted
date: 2026-10-28
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T06:21:35Z }
sources:
  - id: features
    resource: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/develop-asp-net-core-mvc-apps
    title: Developing ASP.NET Core MVC apps, feature organization
  - id: web
    resource: https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures
    title: Common web application architectures
  - id: layering
    resource: https://martinfowler.com/bliki/PresentationDomainDataLayering.html
    title: Presentation Domain Data Layering
  - id: method
    resource: https://prod.d13rzhkk8cj2z0.amplifyapp.com/aidlc.pdf
    title: AI-DLC Method Definition
---

# A slice declares the layers it needs and delivers them whole

## Context and Problem Statement
[0024](0024-vertical-slices-are-features-horizontal-layers.md) defines a vertical slice as one use case cutting through every horizontal layer it needs, built feature by feature, top to bottom.[^features] Nothing says which layers a use case needs, so a slice merges without its table or screen, and a handler's unit test passes as its proof. How is a slice planned, built and proved whole?

## Decision Drivers
* A slice is done only when every layer its use case needs is done: a half slice delivers no business value.
* Several slices use the same data, one creating a store another writes into: the data cannot be one slice's.
* A use case hands off to another by an event or a call; a hand-off nobody declares is one nobody tests.
* Use-case code stays together; what every use case shares stays in the domain's layers, inside the domain module.[^layering]
* The method plans and builds by Unit and bolt;[^method] one grammar carries a slice from intake to the merge.
* Every rule is data a check reads, not a guess left to a prompt.

## Considered Options
* Keep a slice as its `application` folder, the other layers left to the builder.
* Put all of a use case's code in one folder, the layers dropped.
* **Declare each slice's layers and deliver them whole.**

## Decision Outcome
Chosen option: "Declare each slice's layers and deliver them whole", because it states what a whole slice is and keeps the shared layers the architecture checks rely on:
- **Cuts declared:** a slice names the layers its use case cuts, from the stack pack's list: `ui`, `interface`, `application`, `model`, `infrastructure`, `migration`. A query may need only `interface` and `application`.
- **Own code and shared layers:** the slice's own code sits under its name: its screen in `ui`, its route in `interface`, its handler in `application`, as a feature's folder holds its endpoints.[^features] `model`, `infrastructure`, `migration` and the router that mounts every route stay shared, as migrations sit with the infrastructure:[^web] the slice adds its rule, its adapter, its migration and its route there.
- **A user interface on another stack** is a Unit of its own, consuming the slice's API; a slice cuts `ui` only where its pack has it, and a story served through a screen names it.
- **Data stays the domain's,** as [Data ownership](../design/data-ownership.md) has it. A slice declares the data nodes of its domain it reads or writes; its code reaches no other.
- **Entry:** the `runtime` module serving the slice, such as a management front door or an instance endpoint; the plugin names none. A runtime lists what it `applies` to every slice it serves: outcome events, a status contract.
- **Governance is no layer:** authentication, authorization, policy and audit run as `pipeline` stages on the entry, the same for every slice. A slice declares the `permission` the pipeline enforces; a rule on who may act stays in the slice or `model`.
- **Integration:** a slice declares `async` when it answers later, the events it emits and consumes and the domains' clients or adapters it calls. The publishing domain owns an event's contract; each declared integration is proved by a test that names it.
- **One grammar:** intake, models, Units of work, the domain doc's `# Surface` and the bolt carry the same slice with the same cuts, data, entry, permission and integrations. Each word is one the vocabulary holds once.
- **Whole:** a bolt delivers its slices whole; the gate refuses a declared layer the diff leaves out, and a slice is proved by a test that enters through its route.
- **Delivered:** increment 1's first slice cuts through every layer the system has, as the walking skeleton.

### Consequences
* Good, because "done" for a slice is checkable: a missing screen or migration is a refusal.
* Bad, because each slice line grows a layer list, and projects move to method 13 on upgrade.

### Confirmation
The checks of [Building a slice](../design/slice-method.md) and [What a slice declares](../design/slice-declares.md) run at the gate; their tests fail on a slice that leaves a declared layer out.

[^features]: Developing ASP.NET Core MVC apps, feature organization
[^web]: Common web application architectures
[^layering]: Presentation Domain Data Layering
[^method]: AI-DLC Method Definition
