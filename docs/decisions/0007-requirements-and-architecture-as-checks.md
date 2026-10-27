---
type: Decision
title: 0007 Requirements and architecture as checks
description: Lasting requirements become cited docs and architecture rules become gate checks, so a project cannot drift from its intended shape unit by unit.
status: superseded by ADR-0013
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T10:40:00Z }
---

# Requirements and architecture as checks

## Context and Problem Statement
The plugin is project agnostic; its first real user is a multi-service platform with dozens of lasting requirements and a split architecture. Unit gates alone let each change pass while the whole drifts, e.g. from a platform into a single app.

## Considered Options
1. Leave it to the reviewer. Judgment, not a guarantee; misses what the diff does not show.
2. **Requirements as docs the plan cites, boundaries and architecture checks run on every merge.**
3. Language-specific architecture linters shipped by the plugin. Ties the plugin to stacks.

## Decision Outcome
Option 2, agreed with the owner on 2026-10-22. See [Requirements and architecture checks](../design/architecture.md).

Principle 1: a rule that matters is a check. The project supplies the dependency graph, so the plugin stays language neutral; the boundaries and their exceptions are reviewable data in the profile.
