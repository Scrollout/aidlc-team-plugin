---
type: Decision
title: 0020 Architecture models are data
description: A proven system is reverse-engineered from research into a vertical and horizontal architecture model, kept as data the CLI reads, shipped with the plugin or kept by a project, and applied to new and existing projects through the AI-DLC method; the plugin itself stays generic.
status: superseded by ADR-0025
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T20:00:00Z }
---

# Architecture models are data

## Context and Problem Statement
Every project starts from a blank architecture, and the builder improvises the shape. A system built that way drifts: modules with no kinds, a call path whose order is an implementation detail, decisions bent to the code. A proven system's vertical and horizontal shape, distilled into an architecture model, can be applied to new and existing projects instead. How should the plugin hold such architecture models?

## Decision Drivers
* The plugin works for any project: an architecture model must never turn the plugin into one product's tool.
* One architecture model per proven shape, reusable by many projects; a second one needs no change to the plugin.
* The method still decides: the owner approves the architecture model and every decision it seeds, and the CLI's checks hold the result.

## Considered Options
* Architecture models as data: layers, API contracts, rules and starter decisions in an architecture model's folder the CLI reads; the rules are generic types with parameters.
* Architecture models as code: one extension per architecture model, with its own checks.
* No architecture models: architecture knowledge only, in the architect persona.

## Decision Outcome
Chosen option: "Architecture models as data", because an architecture model is then reviewable like any doc, a project can add or override one without a release, and the checks stay generic ([Architecture models](../design/models.md)).

The decision's parts:
* **Who builds architecture models:** both. The plugin ships a pathway for modelling a reference, and we use it for the first architecture model.
* **Where they live:** shipped under `plugin/cli/models/` (so a project's pinned CLI carries them), and a project or organisation may add or override one in `.aidlc/models/`.
* **The first application:** the control-plane architecture model is first applied to an existing control-plane project in M21, with the owner's yes on each step.

### Consequences
* Good, because an architecture model's rules name roles and shapes, never one vendor's names: a project's own API contract supplies those.
* Good, because a reference is evidence and test fixtures, never a default.
* Bad, because the CLI needs a rule-type engine that reads parameters, which is harder to test than one check per rule; each rule type gets its own fixtures.

### Confirmation
`aidlc check` validates an architecture model against the format. A test applies a second, minimal architecture model with no code change. A scan of the shipped architecture models finds no vendor name.

## More Information
The research and observations behind the first architecture model are private to the owner; the shipped architecture model carries only the generic shapes.
