---
type: Decision
title: 0026 A slice declares the layers it needs and delivers them whole
description: A vertical slice names the horizontal layers its use case needs, from the user interface to the schema, the entry that serves it, the data of its domain it uses and how it integrates; its own parts sit under its name, the shared layers stay shared and the data stays the domain's; it is planned, scaffolded, built, checked and reported layer by layer, and merges only whole.
status: accepted
date: 2026-10-28
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T06:21:35Z }
sources:
  - id: vsa
    resource: https://www.jimmybogard.com/vertical-slice-architecture/
    title: Vertical Slice Architecture
  - id: layering
    resource: https://martinfowler.com/bliki/PresentationDomainDataLayering.html
    title: Presentation Domain Data Layering
  - id: method
    resource: https://prod.d13rzhkk8cj2z0.amplifyapp.com/aidlc.pdf
    title: AI-DLC Method Definition
---

# A slice declares the layers it needs and delivers them whole

## Context and Problem Statement
[0024](0024-vertical-slices-are-features-horizontal-layers.md) defines a vertical slice as one use case cutting through every horizontal layer it needs, built feature by feature, top to bottom.[^vsa] The checks hold a slice's folder under `application`, its route and its doc line, but nothing says which layers a use case needs, so a slice that needs a table or a screen merges without it, a handler's unit test passes as its proof, and the packs have no layer for a user interface. How is a slice planned, built and proved whole?

## Decision Drivers
* A slice is done only when every layer its use case needs is done: a half slice delivers no business value.
* Several slices use the same data: one creates a store, another writes into it, through a different entry with its own authorization. The data cannot be one slice's.
* A use case ends where another begins: it answers its caller at once or later, and it hands off by an event or a call. A hand-off nobody declares is one nobody tests.
* Use-case code stays together; what every use case shares stays in the domain's layers, inside the domain module.[^layering]
* The method plans and builds by Unit and bolt;[^method] one grammar carries a slice from intake to the merge.
* Every rule is data a check reads, never a guess left to a prompt.

## Considered Options
* Keep a slice as its `application` folder, the other layers left to the builder.
* Put all of a use case's code in one folder, the layers dropped.
* **Declare each slice's layers and deliver them whole.**

## Decision Outcome
Chosen option: "Declare each slice's layers and deliver them whole", because it states what a whole slice is and keeps the shared layers the architecture checks rely on:
- **Layers declared:** a slice names the layers its use case needs, from the stack pack's list: `ui`, `interface`, `application`, `model`, `infrastructure`, `schema`. A query that reads existing data may need only `interface` and `application`; a command behind a screen that stores a new field needs them all.
- **Own parts and shared layers:** the slice's own parts sit under its name: its screen in `ui`, its route in `interface`, its handler in `application`, its migration in `schema`, as a slice holds its endpoint.[^vsa] `model` and `infrastructure`, and the router that mounts every route, stay shared by the domain's slices: the slice adds its rule, extends its adapter and mounts its route there.
- **A user interface on another stack** is a Unit of its own, consuming the slice's published API; a slice declares `ui` only where its stack's pack has the layer, and a story served through a screen names it.
- **Data stays the domain's:** the domain module owns its data, as [Data ownership](../design/data-ownership.md) has it. A slice declares the data nodes of its domain it reads or writes, and the migration it adds; its code reaches no other data.
- **Entry:** a slice names the entry that serves it, one its system defines, such as a management front door or an instance endpoint, each with its own authorization and governance. Entries are data of the project or its model; the plugin names none. An entry may add to every slice it serves: the events each outcome emits, the status contract of a long-running request.
- **Integration:** a slice declares its response mode, `sync` or `async`, the events it emits and consumes and the domains' clients or adapters it calls. The publishing domain owns an event's contract; each declared integration is proved by a test that names it.
- **One grammar:** intake, models, Units of work, the domain doc's `# Surface` and the bolt carry the same slice with the same layers, data, entry and integrations.
- **Whole:** a bolt delivers its slices whole; the gate refuses a declared layer the diff leaves out, and a slice is proved by a test that enters through its route.
- **Delivered:** increment 1's first slice cuts through every layer the system has, as the walking skeleton.

### Consequences
* Good, because "done" for a slice is checkable, and a missing screen or migration is a refusal, not a later surprise.
* Good, because the board, `status` and the trace show each slice layer by layer, with the data it reaches and the entry that serves it.
* Bad, because each slice line grows a list of layers, and the projects' docs move to method 13 on upgrade.

### Confirmation
The checks of [Building a slice](../design/slice-method.md) run at the gate; their tests fail on a slice that leaves a declared layer out.

[^vsa]: Vertical Slice Architecture
[^layering]: Presentation Domain Data Layering
[^method]: AI-DLC Method Definition
