---
type: Design
title: What a slice declares
description: What a vertical slice declares beyond its layers - the data of its domain it uses, the entry that serves it, how it integrates and the governance it needs - each checked at the gate and proved by a test.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T07:16:35Z }
---

# Why
A slice's cuts say what it builds; what it declares says what it reaches: data it shares with its domain's other slices, the entry every request crosses, the slices of other domains it hands off to and the governance it must pass ([Building a slice](slice-method.md), [0026](../decisions/0026-a-slice-declares-the-layers-it-needs-and.md)).

# Data and entry
- **Data** stays the domain's ([Data ownership](data-ownership.md)): several slices use it. A slice declares the data nodes of its domain it reads or writes. A query may read them straight into the view it returns, past the domain model; a command changes them through the model.
- **Entry:** the `runtime` module serving the slice, as 0024 names a runtime the entry. A runtime lists what it `applies` to every slice it serves. The plugin names none.

# Integration
- **`async`:** the slice accepts a request and answers later, through a status contract that ends in a terminal state; without it, it answers in the request.
- **Events:** `emits` names the integration events the slice publishes to other domains, past tense and versioned, in its domain's `events` surface; `consumes` names those it reacts to, each in its publisher's surface. The publisher owns the event's contract. A domain event between the domain's own aggregates stays inside its model and is not declared.
- **Calls:** `calls` names the other domains' `client`s and the adapters it uses.
- **From the entry:** what a runtime `applies` to every slice it serves: an outcome event per operation, the status contract of `async`, its governance stages. A slice served by it gets them without declaring them.

# Governance
Governance is no layer of a slice: what every request must pass is the same for every slice, and a slice that brings its own check can forget it.
- **Platform governance** (authentication, role-based authorization, policy, locks, audit, throttling) runs as `pipeline` stages on the entry, listed in its `applies`.
- **The slice's permission:** `permission` names what it needs, composed by the registry's `permission` grammar as its route and events are; the pipeline enforces it, the audit record and the outcome events carry it.
- **Input validation** is the slice's own code, a validator beside its handler, run by the pipeline before the handler.
- **Business authorization**, such as only an order's owner cancelling it, is a domain rule: in the slice's handler or a rule in `model`.

Checked and proved:
- `SLICE-GOVERN`: a slice whose entry `applies` a `pipeline` layer of the chosen model declares no `permission`, or its own code imports a `pipeline` module, to authenticate or authorize itself. The stages are governance, so an entry running any of them makes the slice name what it needs.
- A test at a level whose `proves` holds `route` sends a request without the permission and sees it refused before the handler runs; a business rule has its own refusal test.
- The trace lists each slice's `permission`: the system's permission catalogue.

Bolts: [M29](../roadmap/m29.md) B250, B252, B253.
