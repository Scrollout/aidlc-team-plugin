---
type: Design
title: Architecture in arc42
description: The plugin's architecture in arc42's twelve sections, each pointing at the design doc or generated page that holds it, with a C4 component view of the CLI.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T14:00:00Z }
---

# Introduction and Goals
AI-DLC with every rule that matters enforced by a CLI or a hook: [Overview](overview.md), [Method](method.md).

# Constraints
Node 24+, no dependencies, the budgets, nothing written into a project naming the plugin: [Overview](overview.md#budgets-hard-limits), [Library and extensions](library.md).

# Context and Scope
The owner and their requests in plain prose, the lead session in its role personas, builder, reviewer and researcher agents, the project's git repository and its CI, and the coding agent's hooks: [Team](team.md), [Intake](intake.md), [Hook mechanics](hooks.md).

# Solution Strategy
A deterministic AI-DLC: one word per concept, structure declared once and the rest generated, derived state and no ledger: [0013](../decisions/0013-a-deterministic-ai-dlc.md), [0001](../decisions/0001-derived-state.md), [Standard formats](standards.md). Proven shapes come as architecture models, data the checks read: [0020](../decisions/0020-architecture-models-are-data.md), [0021](../decisions/0021-the-control-planes-api-conventions-belong-to-its.md).

# Building Block View
Foundation kits, domains and a runtime, with extensions plugged in through seams: [Library and extensions](library.md) and the generated C4 component view, [CLI components](diagrams/cli-components.md).

# Runtime View
An intent through its pathway, a bolt from approval to merge, an intent to release: [Workflow](diagrams/workflow.md), [Bolt states](diagrams/bolt-states.md), [Intent states](diagrams/intent-states.md), [Merge mechanics](gate.md).

# Deployment View
The plugin installs from a marketplace, and each project pins a vendored copy of the CLI: [Vendoring](vendoring.md), [0004](../decisions/0004-vendored-cli.md).

# Crosscutting Concepts
The docs bundle, naming, hooks and approvals: [OKF](okf.md), [Bundle v2](bundle.md), [Naming](naming.md), [Hook checks](hook-checks.md), [Approvals](approvals.md). A request to an intent and a model to a project: [Intake](intake.md), [Elaboration checks](elaboration.md), [Models](models.md).

# Architecture Decisions
In MADR 4.0: [Decisions](../decisions/index.md).

# Quality Requirements
The budgets and the checks that hold every rule, each with its code: [Overview](overview.md#budgets-hard-limits), the generated code pages ([Docs check codes](tables/codes-bundle.md), [Plan lint codes](tables/codes-plan.md), [Intent and bolt codes](tables/codes-intent.md), [Gate codes](tables/codes-gate.md), [Hook codes](tables/codes-hooks.md)).

# Risks and Technical Debt
Open ideas and known limits: [Later](../roadmap/later.md).

# Glossary
[Canonical model](canonical-model.md#words), drawn by scale in [Words by scale](diagrams/canonical-model.md).
