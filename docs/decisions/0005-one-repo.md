---
type: Decision
title: 0005 One repo
description: Develop and ship from one repo; the installable plugin is the plugin/ folder only.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Options
1. A dev repo plus a separate product repo. Clean product, but every change needs a sync or release step between repos.
2. **One repo, product in `plugin/`.** The marketplace entry selects the folder.

# Decision
Option 2.

# Why
Runtime cost comes only from what the plugin loads (skill, agents, hooks), not from repo size, and those all live in `plugin/`. One repo keeps a change, its test and its doc in one commit.

# Revisit when
The plugin needs a product repo of its own; then `git subtree split --prefix plugin` produces the product repo with history.
