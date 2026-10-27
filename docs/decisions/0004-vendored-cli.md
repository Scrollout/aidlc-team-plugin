---
type: Decision
title: 0004 Vendored CLI
description: The CLI is zero-dependency Node, copied into each project at .aidlc/bin and pinned there.
status: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Vendored CLI

## Context and Problem Statement
A project that runs its rules from a tool it does not hold must pin its commits in CI, and is blocked whenever its release is.

## Considered Options
1. Run the CLI from the installed plugin. Versions differ per developer; CI needs the plugin.
2. Publish to npm. Adds a registry, a release process and a network dependency.
3. **Vendor into `.aidlc/bin/`** on `init` and `upgrade`.

## Decision Outcome
Option 3.

One pinned version per project, reviewable in git, upgraded on purpose. Node is already required by Claude Code. Cost: a few files in each project.
