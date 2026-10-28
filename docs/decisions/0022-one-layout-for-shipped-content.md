---
type: Decision
title: 0022 One layout for shipped content
description: Each content package the plugin ships (templates, personas, models, packs) sits at the top of the plugin folder and holds all it owns; a project pins one copy laid out the same way and overrides a file at the same path.
status: accepted
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T17:20:52Z }
---

# One layout for shipped content

## Context and Problem Statement
The CLI's folder holds the engine, card templates, a board template, the role personas and the architecture models. Doc templates sit elsewhere, and the stack packs elsewhere again. An architecture model's reference code lives inside a stack pack. A project pins the CLI to `.aidlc/bin/` and the packs to `.aidlc/packs/`, and templates resolve through two different lookups. Where a file lives no longer follows from what it is. This decision replaces the "Where they live" point of [0020](0020-architecture-models-are-data.md).

## Considered Options
1. Keep the current places.
2. **One package per kind of content at the top of the plugin folder, one pinned copy laid out the same way, overrides at the same path.**
3. Everything under the CLI's folder.

## Decision Outcome
Chosen option: "One package per kind of content", because a file's place then follows from its kind, an architecture model keeps its decisions, knowledge and reference code together, and one rule covers pinning and overriding ([Shipped layout](../design/layout.md)).

### Consequences
- Good, because one resolver replaces the separate lookups.
- Good, because a pinned project carries every package the same way.
- Bad, because pinned projects need a one-time move of `.aidlc/packs/`, which `upgrade` does.

### Confirmation
A test fails when a shipped file sits outside its package's folder, or when a lookup bypasses the resolver.
