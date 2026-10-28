---
type: Decision
title: 0004 Vendored CLI
description: The CLI is zero-dependency Node, copied into each project at .aidlc/bin and pinned there.
status: accepted
date: 2026-10-22
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Vendored CLI

## Context and Problem Statement
A project that runs its rules from a tool it does not hold must pin its commits in CI, and is blocked whenever that tool's release is. Where does a project's CLI come from?

## Decision Drivers
* One version per project, the same for every developer and for CI.
* No registry or network at run time.

## Considered Options
* Run the CLI from the installed plugin.
* Publish it to npm.
* **Vendor it into `.aidlc/bin/`** on `init` and `upgrade`.

## Decision Outcome
Chosen option: "Vendor it into `.aidlc/bin/`", because one pinned version per project is reviewable in git and upgraded on purpose, while the installed plugin differs per developer and is absent in CI, and npm adds a registry, a release process and a network dependency. Node is already required by Claude Code.

### Consequences
* Good, because CI runs the same CLI as every developer.
* Bad, because each project holds a few more files.
