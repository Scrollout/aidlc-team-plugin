---
type: Design
title: Architecture in arc42
description: The plugin's architecture in arc42's twelve sections, each stated here, with links to the detail.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T14:00:00Z }
---

# Introduction and Goals
**The goal:** agents, driven by the plugin, deliver reliable, high-quality software built as whole vertical slices, each use case cut through every horizontal layer it needs, graded at every level and from every angle against a real reference system, with no gaps and no drift.

It follows two sources, which win over its own words and designs:
1. **The AI-DLC method** as researched: intent, units of work, bolts, with the owner in the loop ([Method](method.md)).
2. **Vertical slices across horizontal layers**, as the hyperscalers' official architecture guidance defines them ([0024](../decisions/0024-vertical-slices-are-features-horizontal-layers.md), [Building a slice](slice-method.md)).

Quality goals, in order: whole, correct slices; the same docs and history always give the same next step and verdict; the owner decides intent, plan, one-way doors and release; cheap context and AI models; nothing tied to one stack or product.

# Constraints
- Node 24 or later, no dependencies, plain ES modules.
- Size budgets on prompts, cards, hooks and the CLI's code, checked in CI ([Overview](overview.md#budgets-hard-limits)).
- Nothing the plugin writes into a project names the plugin.

# Context and Scope
| Who or what | What passes |
|---|---|
| Owner | The owner's request in plain words in; approvals and release decisions in; status out |
| Lead (the main agent session) | Asks the CLI for the next step and does it |
| Builder, reviewer and researcher agents | Each gets one card or brief; builds in its own git worktree, reviews, or researches |
| Git repository and CI | Docs and code in; merges, tags and CI runs out |
| Coding agent's hooks | Every tool call an agent makes passes the plugin's hooks first |

The project owns its code, docs bundle and profile.

# Solution Strategy
- **One CLI holds every rule.** Hooks, agents and the lead all call it; no rule lives only in a prompt.
- **State is derived, never stored:** from the docs and git history ([0001](../decisions/0001-derived-state.md), [0013](../decisions/0013-a-deterministic-ai-dlc.md)).
- **Declared once, the rest generated:** indexes, maps, traces and cards.
- **Proven shapes as data:** an architecture model brings a reference system's layers and rules ([0020](../decisions/0020-architecture-models-are-data.md)).

# Building Block View
| Block | Does |
|---|---|
| CLI core: foundation kits | Data, git, text, YAML, globs, the profile |
| CLI core: domains | The docs bundle, the plan, cards, the gate, reviews, approvals, the hooks' rules |
| CLI extensions | Optional parts that plug into the core: board, API contracts, intake, architecture models, Deployment and Operation, slices, stack packs |
| Hooks, agents, skill | Hooks call the CLI on each tool call; builder, reviewer and researcher prompts; the lead's skill |
| Templates, role personas, stack packs | What `init` and `scaffold` write; the lead's roles; each stack's layout |

The core never imports an extension; an extension uses only the core's public entry ([Library and extensions](library.md), [C4 components](diagrams/cli-components.md)). [Logical view](views/logical.md).

# Runtime View
One bolt from approval to release, as a sequence: [Runtime view](views/runtime.md). The steps and states: [Workflow](diagrams/workflow.md), [Bolt states](diagrams/bolt-states.md), [Merge mechanics](gate.md).

# Deployment View
Installed from a marketplace; `init` pins a copy of the CLI in the project (`.aidlc/`), so every machine and CI run uses one version ([Vendoring](vendoring.md), [0004](../decisions/0004-vendored-cli.md)). [Technical view](views/technical.md).

# Crosscutting Concepts
- [Docs bundle v2](bundle.md) in OKF; names composed from a registry ([Naming](naming.md)); approvals only the owner's command stamps ([Approvals](approvals.md)); hooks refusing a rule break as it happens ([Hook checks](hook-checks.md)); [one word per concept](canonical-model.md).

# Architecture Decisions
Each one-way choice is a decision in MADR 4.0, approved by the owner: [Decisions](../decisions/index.md).

# Quality Requirements
| Goal | Held by |
|---|---|
| Whole, correct slices | Each slice declares its cuts; the gate refuses a missing cut, an undeclared data, call or integration event, an unproved route |
| Deterministic | The same inputs give the same `next`, card hash and gate verdict; tests check it |
| The owner decides | Owner steps exit with code 2; only the owner's typed command stamps an approval |
| Cheap | Context, prompt and card budgets, checked in CI |
| Fast | A blocking hook adds at most 500 ms |
| Correct merges | The gate reruns tests on the merge result, and again with the bolt's code reverted, where its tests must fail |

Each check's code and fix: [Gate codes](tables/codes-gate.md), [Plan lint codes](tables/codes-plan.md), [Docs check codes](tables/codes-bundle.md), [Intent and bolt codes](tables/codes-intent.md), [Hook codes](tables/codes-hooks.md).

# Risks and Technical Debt
- The guard stops mistakes, not attackers: the shell is not sandboxed.
- Static checks read imports and names, not behaviour; the reviewer covers the rest.
- Open ideas and known limits: [Later](../roadmap/later.md).

# Glossary
[The words](canonical-model.md#words), each scale on its own page ([Words by scale](diagrams/canonical-model.md)).
