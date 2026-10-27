---
type: Decision
title: 0021 The control plane's API conventions belong to its model
description: The resource-hierarchy part of decision 0014's grammar (scope segments, the providers segment and its namespace, the resource envelope's systemData, value and nextLink lists) moves from the plugin's defaults into the control-plane model's contract, applied only where a project chose that model; the generic casing and format rules stay the plugin's.
status: accepted
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
supersedes: 14
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T22:00:00Z }
---

# The control plane's API conventions belong to its model

## Context and Problem Statement
Decision 0014 shipped one control plane's API conventions as the default grammar of every project that opts into naming. The plugin must work for any project, and a proven shape now lives in an architecture model ([0020](0020-architecture-models-are-data.md)). Which part of the grammar is the plugin's, and which is the control plane's?

## Decision Drivers
* The plugin works for any project: no one system's shape in its defaults.
* A project that chose the control-plane model keeps every rule it had.

## Considered Options
* Split: generic rules stay the plugin's; the resource hierarchy moves to the control-plane model's `contract`.
* Leave decision 0014's defaults as they are.

## Decision Outcome
Chosen option: "Split", because the generic rules then serve every project and the control plane's shape applies only where its model is chosen.
* **The plugin's grammar:** a dated `info.version`, camelCase path segments, full parameter names ending in `Name` or `Id`, an even segment count on a PUT path, `Noun_Verb` operation ids, lowerCamel properties, no `is` booleans, PascalCase enums.
* **The control-plane model's `contract`:** the scope segments, the `providers` segment and its dotted PascalCase namespace, the resource envelope that carries `systemData`, and lists of `value` with `nextLink`. The contracts check reads them from the chosen model.

### Consequences
* Good, because a project with no model, or another model, gets only the generic rules.
* Bad, because a project that relied on the old defaults without choosing a model loses those checks until it chooses the control-plane model.

### Confirmation
A contracts test without a chosen model finds no resource-hierarchy finding; with the control-plane model chosen, the same document gets them.
