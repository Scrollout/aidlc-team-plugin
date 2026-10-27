---
type: Decision
title: 0020 Architecture models are data
description: A proven system is reverse-engineered from research into a vertical and horizontal architecture model, kept as data the CLI reads, shipped with the plugin or kept by a project, and applied to new and existing projects through the AI-DLC method; the plugin itself stays generic.
status: accepted
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T20:00:00Z }
---

# Architecture models are data

## Context and Problem Statement
Every project starts from a blank architecture, and the builder improvises the shape. A control plane built that way drifted: modules with no kinds, a request path whose order was an implementation detail, decisions bent to the code. The owner wants proven systems studied, their vertical and horizontal shape distilled into a model, and the model applied to new and existing projects (2026-10-27). How should the plugin hold such models?

## Decision Drivers
* The plugin works for any project: a model must never turn the plugin into one product's tool (the owner, 2026-10-27).
* One model per proven shape, reusable by many projects; a second model needs no change to the plugin.
* The method still decides: the owner approves the model and every decision it seeds, and the CLI's checks hold the result.

## Considered Options
* Models as data: layers, contracts, rules and starter decisions in a model folder the CLI reads; the rules are generic types with parameters.
* Models as code: one extension per model, with its own checks.
* No models: architecture knowledge only, in the architect persona.

## Decision Outcome
Chosen option: "Models as data", because a model is then reviewable like any doc, a project can add or override one without a release, and the checks stay generic ([Models](../design/models.md)).

The owner's answers, 2026-10-27:
* **Who builds models:** both. The plugin ships a pathway for modelling a reference, and we use it for the first model.
* **Where they live:** shipped under `plugin/cli/models/` (so a project's pinned CLI carries them), and a project or organisation may add or override one in `.aidlc/models/`.
* **The first project:** the control-plane model is first applied to an existing control-plane project, as the M21 pilot, with the owner's yes on each step.

### Consequences
* Good, because a model's rules name roles and shapes, never one vendor's names: a project's own contract supplies those.
* Good, because a reference is evidence and test fixtures, never a default.
* Bad, because the CLI needs a rule-type engine that reads parameters, which is harder to test than one check per rule; each rule type gets its own fixtures.

### Confirmation
`aidlc check` validates a model against the format. A test applies a second, minimal model with no code change. A scan of the shipped models finds no vendor name.

## More Information
The research and observations behind the first model are private to the owner; the shipped model carries only the generic shapes.
