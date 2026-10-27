---
type: Design
title: Models
description: Draft - architecture models as data - a proven system's vertical and horizontal shape distilled from research, shipped or kept by a project, applied to new and existing projects by the AI-DLC method, and held by generic rule types.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T20:00:00Z }
---

# Why
A new project should start from a proven shape, not a blank page, and an existing one should be measured against it ([0020](../decisions/0020-architecture-models-are-data.md)).

# The pipeline
1. **Reverse-engineer a reference:** research a proven system, and observe it where the sources are silent. The evidence stays with the owner.
2. **Distil a model:** its horizontal layers and its vertical slices, as data.
3. **Apply the model** to a project with the AI-DLC method: proposed at intake, seeded as decisions the owner approves, cut into increments, held by the checks.

# A model
A folder, `models/<name>/`:
- `model.json`:
  - `layers`: the horizontal layers, in order, each with its kind and its role;
  - `domains`: the shared domains every slice relies on;
  - `slice`: the vertical contract: what each slice declares and must offer;
  - `contracts`: what passes between layers and slices;
  - `rules`: rule types with their parameters;
  - `decisions`: the starter decisions;
  - `fit`: the signals intake matches;
  - `slices`: the reference slice per stack pack.
- `knowledge/`: what the architect persona reads to apply the model.
- `decisions/`: starter decisions in MADR, proposed until the owner approves each one.

A model's rules name roles and shapes, never one vendor's names; the project's own contract fills those in.

# Where models live
- Shipped under `plugin/models/<name>/`, beside the stack packs.
- A project or organisation adds or overrides one in `.aidlc/models/<name>/`; the local one wins.
- `aidlc check` validates every model it can see.

# Modelling a reference
The `model` pathway:
1. a research brief on the reference;
2. the researcher's cited digest;
3. the architect persona drafts the model from it;
4. the owner approves it, the one-way doors one at a time.

The model doc cites the digest's sources, as an intent cites its request.

# Applying a model
- **Greenfield:** intake proposes the models whose fit matches the request. Choosing one writes the system doc and the proposed decisions, and cuts the increments along its layers and slices.
- **Brownfield:** the codebase map's modules are matched to the model's layers and kinds; the gaps become the intent's increments.

# Rule types
Each is generic, takes its parameters from the model, and is on only where the chosen model sets it:
- **stage order** (`PIPELINE-ORDER`): the front door calls its stages in the model's order;
- **slice contract** (`PROVIDER-CONTRACT`): each slice declares what the model's `slice` asks;
- **long-running operations:** each declared async write answers in one of the model's shapes, with a status link, a result link, a retry hint and terminal states;
- **idempotency:** every write bolt has an AC that a repeated write leaves status and state unchanged;
- **data** (`DATA-PARTITION`): each table declares its partition key and data class;
- **events** (`EVENT-COVERAGE`): every write, delete and action emits an event, on failure as well as success.

# The first model: control plane
- **Layers:** a front door; governance (authenticate, authorize, policy, lock, throttle); resource metadata; operations; deployments; events and an activity log.
- **Slice:** a provider per namespace, its resource types, and whether each type's writes are long-running.
- **Rules:** the stage order; long-running operations; idempotent writes; deployments that converge by re-applying, without compensation unless a project decides otherwise.
- **First applied** to an existing control-plane project (the M21 pilot).

Bolts: [M24](../roadmap/m24.md) B228, B229, B230, B231, B232, B233, B234.
