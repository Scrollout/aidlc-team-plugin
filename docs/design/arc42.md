---
type: Design
title: Architecture in arc42
description: The plugin's architecture in arc42's twelve sections, each stated here, with links to the detail.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T14:00:00Z }
---

# 1 Introduction and goals
Coding agents build software by the AI-DLC method, the owner deciding only what is theirs. Every rule that matters is enforced by code, not left to an agent's memory.

Quality goals, in order:
1. **Deterministic:** the same docs and git history always give the same next step and the same verdict.
2. **The owner decides:** an intent, a plan, a one-way door and a release each need the owner's approval; agents do the rest.
3. **Cheap:** little always-on context, smaller AI models for building, the larger one for review.
4. **Any project:** nothing in the plugin is specific to one stack or product.

# 2 Constraints
- Node 24 or later, no dependencies, plain ES modules.
- Size budgets on prompts, cards, hooks and the CLI's code, checked in CI ([Overview](overview.md#budgets-hard-limits)).
- Nothing the plugin writes into a project names the plugin.

# 3 Context and scope
| Who or what | What passes |
|---|---|
| Owner | Their request in plain words in; approvals and release decisions in; status out |
| Lead (the main agent session) | Asks the CLI for the next step and does it, in a role persona for analysis and design |
| Builder, reviewer and researcher agents | Each gets one card or brief; builds in its own git worktree, reviews, or researches |
| Git repository and CI | Docs and code in; merges, tags and CI runs out |
| Coding agent's hooks | Every tool call an agent makes passes the plugin's hooks first |

The project owns its code, docs bundle and profile.

# 4 Solution strategy
- **One CLI holds every rule.** Hooks, agents and the lead all call it; no rule lives only in a prompt.
- **State is derived, never stored:** from the docs and git history ([0001](../decisions/0001-derived-state.md), [0013](../decisions/0013-a-deterministic-ai-dlc.md)).
- **Declared once, the rest generated:** indexes, maps, traces and cards.
- **Proven shapes as data:** an architecture model gives a project a reference system's layers and rules, which the checks read ([0020](../decisions/0020-architecture-models-are-data.md)).
- **Vertical slices:** each use case is built through every layer it needs and checked whole ([Building a slice](slice-method.md)).

# 5 Building block view
| Block | Does |
|---|---|
| CLI core: foundation kits | Data, git, text, YAML, globs, the profile, runtime files |
| CLI core: domains | The docs bundle, the plan, cards, the gate, reviews, approvals, the hooks' rules |
| CLI extensions | Optional parts that plug into the core: board, API contracts, intake, architecture models, operations, slices, stack packs |
| Hooks | Thin wrappers calling the CLI on each tool call |
| Agents and skill | Builder, reviewer and researcher prompts; the lead's skill |
| Templates, personas, packs | What `init` and `scaffold` write, how the lead works in a role, each stack's layout |

The core never imports an extension; an extension uses only the core's public entry ([Library and extensions](library.md), [CLI components](diagrams/cli-components.md)).

# 6 Runtime view
One change, start to end:
1. The owner states a request; `aidlc intake` keeps it word for word.
2. The lead elaborates an intent with the owner; the owner approves it.
3. The lead plans bolts; the owner approves the plan.
4. Each builder takes its card, writes tests first, then code, in its worktree.
5. A reviewer with a fresh context checks the bolt against the same card.
6. `aidlc merge` runs the gate on the merge result, and merges only if it passes.
7. CI runs on the pushed base; the owner types `release`, the CLI releases and runs the smoke test.

[Workflow](diagrams/workflow.md), [Bolt states](diagrams/bolt-states.md), [Merge mechanics](gate.md).

# 7 Deployment view
The plugin installs from a marketplace. `init` copies a pinned CLI into the project (`.aidlc/`), so every machine and CI run uses the same version ([Vendoring](vendoring.md), [0004](../decisions/0004-vendored-cli.md)).

# 8 Crosscutting concepts
- **Docs bundle:** the project's docs folder in OKF, with generated indexes ([OKF](okf.md), [Bundle v2](bundle.md)).
- **Names from a registry:** every name composed from a grammar, never invented ([Naming](naming.md)).
- **Approvals:** stamps only the owner's typed command writes ([Approvals](approvals.md)).
- **Hooks block at the action:** a rule break is refused when it happens, not found later ([Hook checks](hook-checks.md)).
- **One word per concept:** [Canonical model](canonical-model.md).

# 9 Architecture decisions
Each one-way choice is a decision in MADR 4.0, approved by the owner: [Decisions](../decisions/index.md).

# 10 Quality requirements
| Goal | Held by |
|---|---|
| Deterministic | The same inputs give the same `next`, card hash and gate verdict; tests check it |
| The owner decides | Owner steps exit with code 2; only the owner's typed command stamps an approval |
| Cheap | Context, prompt and card budgets, checked in CI |
| Fast | A blocking hook adds at most 500 ms |
| Correct merges | The gate reruns tests on the merge result, and again with the bolt's code reverted, where its tests must fail |

Every check has a code and a fix: [Gate codes](tables/codes-gate.md), [Plan lint codes](tables/codes-plan.md), [Docs check codes](tables/codes-bundle.md), [Intent and bolt codes](tables/codes-intent.md), [Hook codes](tables/codes-hooks.md).

# 11 Risks and technical debt
- The guard stops mistakes, not attackers: the shell is not sandboxed.
- Static checks read imports and names, not behaviour; the reviewer covers the rest.
- Open ideas and known limits: [Later](../roadmap/later.md).

# 12 Glossary
[Canonical model](canonical-model.md#words), each scale on its own page ([Words by scale](diagrams/canonical-model.md)).
