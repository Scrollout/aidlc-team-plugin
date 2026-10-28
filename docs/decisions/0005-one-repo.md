---
type: Decision
title: 0005 One repo
description: Develop and ship from one repo; the installable plugin is the plugin/ folder only.
status: accepted
date: 2026-10-22
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# One repo

## Context and Problem Statement
The plugin's code, its tests and its docs change together, and what a project installs must hold only what it loads. Is the plugin developed and shipped from one repo or two?

## Decision Drivers
* A change, its test and its doc in one commit.
* What is installed holds only what the plugin loads.

## Considered Options
* A development repo and a separate product repo.
* **One repo, the product in `plugin/`.**

## Decision Outcome
Chosen option: "One repo, the product in `plugin/`", because the marketplace entry selects the folder and runtime cost comes only from what the plugin loads (skill, agents, hooks), all in `plugin/`, while two repos need a sync or release step for every change.

### Consequences
* Good, because a change, its test and its doc land in one commit.
* Bad, because the repo holds more than a project installs.

## More Information
Revisit when the plugin needs a product repo of its own; `git subtree split --prefix plugin` then produces it with its history.
