---
type: Design
title: Canonical model
description: Draft - one word per concept at each scale (system, domain, code, delivery), mapped to AI-DLC's Intent, Unit and Bolt, with the rule that a word used in another sense fails a check and that an approved intent keeps the method version it was approved under.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Sources
The method definition whitepaper, the reference AI-DLC workflows (2.11.1) and the method's launch talk (2025), read on 2026-10-26.

# Why
On `resource-manager` (2026-10-26) "vertical slice" meant a delivery step in `slices.md`, a bounded context in `slice-architecture.md`, and any module with layers in `map.mjs`. The project went through three architecture vocabularies in one day. A word with two meanings can't be checked, so every concept gets one word at one scale ([0013](../decisions/0013-deterministic-ai-dlc.md)).

# Words
| Scale | Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|---|
| System | core | the shared platform every extension uses | the system | profile `system.core` |
| System | extension | a vertical capability owned elsewhere, built only against published contracts | another team's Units | profile `system.extensions` |
| Domain | domain | a bounded context: its data, language, contract and events | **Unit** | `domains/<code>.md`, module `kind: domain` |
| Domain | kind | `domain`, `pipeline`, `foundation`, `adapter`, `runtime`, `extension`, `delivery` | - | module `kind` |
| Code | slice | one operation (command or query) of one domain, end to end, in one folder | part of a Unit's stories | the domain's `surface` |
| Code | layer | a position inside a module: `interface`, `application`, `model`, `infrastructure` | logical design | the stack pack |
| Delivery | intent | one business outcome | **Intent** | `intents/I-<n>-<slug>.md` |
| Delivery | increment | a shippable step of an intent; increment 1 is the walking skeleton | groups Bolts | the intent's `# Increments`, `I-<n>.<k>` |
| Delivery | bolt | the smallest build cycle: one card, worktree, review and merge | **Bolt** | `bolts/B-<n>-<slug>.md` |
| Delivery | fix bolt | one regression, one AC failing before the fix | defect-fix pathway | a bolt with `fix: true` |

**Retired, in these senses:** unit (a work item), slice (a delivery step), bundle and component (structure), capability (a module). "Unit" stays only as a test level.

# What is AI-DLC's and what is the plugin's own
- **From AI-DLC:**
  - Intent, Unit, Bolt;
  - the loop at every stage (AI plans, human validates, AI executes, human verifies);
  - Mob Elaboration;
  - context kept in the repository;
  - the walking-skeleton first Unit.
- **The plugin's own, to reach AI-DLC's enterprise goal:**
  - the closed kinds and the kind matrix;
  - one domain per bolt;
  - increments;
  - the naming registry;
  - every rule as a check.

  Neither the reference AI-DLC workflows nor the method's launch talk gives a rule for where a Unit's boundary falls.

Docs and messages say "the method" for the first group and "the plugin" for the second, never "AI-DLC requires" for the plugin's own rules.

# Rules
- `cli.json` holds the vocabulary: words, retired words with their replacement, and the closed lists. Checks and the generated glossary read it, nothing else.
- `TERM-SYNONYM` reports a retired word in its old sense, on the project's docs and code (M16) and on this repo (M20).
- **Pinned method.** Approving an intent writes `method: <version>`, the vendored CLI's method version. Checks on that intent's bolts use the rules of that version, kept in `cli.json` by version. `upgrade` lists the rule changes it brings and applies them to intents approved afterwards.
- An approved intent's `method/` pages are frozen at its version ([Bundle](bundle.md)).

Bolts: [M15](../roadmap/m15.md) B150, B154.
