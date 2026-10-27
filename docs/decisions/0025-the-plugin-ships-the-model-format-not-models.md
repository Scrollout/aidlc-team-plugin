---
type: Decision
title: 0025 The plugin ships the model format, not models
description: Architecture models stay data the CLI reads, but the plugin ships none; a model lives with the project or organisation that uses it, in .aidlc/models/<name>/, and the control-plane model is kept outside the package as an example.
status: accepted
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
supersedes: "0020"
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T02:00:00Z }
---

# The plugin ships the model format, not models

## Context and Problem Statement
The plugin is installed by every future project, whatever it builds. A model describes one kind of system: a control plane fits a control plane and nothing else. Shipped in the package, it is offered at intake and pinned into projects it does not fit, and the package carries one system's reference code. Where do architecture models live?

## Decision Drivers
* The package stays generic: it holds what every project uses, and nothing one kind of system needs.
* A model stays data, reviewable and applied through the method, as 0020 decided.

## Considered Options
* Ship no model: the plugin holds the format, the rule types, `models apply` and `models gaps`; a model lives in `.aidlc/models/<name>/`.
* Keep shipping models, the project's own winning.

## Decision Outcome
Chosen option: "Ship no model", because a model belongs to the systems it fits, and the package stays the same for every project.

The decision's parts:
* **Kept from 0020:** models are data; the `model` pathway models a reference; `aidlc check` validates every model a project holds; a model's rules name roles and shapes, never a vendor's names.
* **Where models live:** a project's or organisation's `.aidlc/models/<name>/`, its reference code with it. The plugin ships and pins none.
* **The control-plane model:** kept in the repository under `examples/models/control-plane/`, outside the package, with its reference tested in CI. A project that fits it copies it into its own models folder.

### Consequences
* Good, because the package holds no one system's shape or code, and intake proposes only the models a project holds.
* Bad, because a project that fits the example copies it first; the copy is the project's to keep current.

### Confirmation
A test fails when `plugin/models/` exists, and `aidlc models` lists only the project's models.

## More Information
Supersedes [0020](0020-architecture-models-are-data.md); [Models](../design/models.md).
