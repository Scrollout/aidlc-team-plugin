---
type: Decision
title: 0004 Vendored CLI
description: The CLI is zero-dependency Node, copied into each project at .aidlc/bin and pinned there.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** The project's copy of the CLI judges the project. CI never needs the plugin installed.

## Context
A pilot project had to pin a previous tool's SHAs in CI and was at one point blocked on its release.

## Options
1. Run the CLI from the installed plugin. Versions differ per developer; CI needs the plugin.
2. Publish to npm. Adds a registry, a release process and a network dependency.
3. **Vendor into `.aidlc/bin/`** on `init` and `upgrade`.

## Decision
Option 3.

## Why
One pinned version per project, reviewable in git, upgraded on purpose. Node is already required by Claude Code. Cost: a few files in each project.
