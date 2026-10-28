---
type: Decision
title: 0028 The owner can delegate upgrades
description: A third delegated class, upgrade, lets the lead run the installed plugin's upgrade between bolts without an owner prompt; a downgrade or a dirty tree still asks the owner, who still chooses when the plugin itself is updated. It extends 0008.
status: accepted
date: 2026-10-28
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T15:30:00Z }
---

# The owner can delegate upgrades

## Context and Problem Statement
Decision 0008 lets the owner delegate two classes of approval, re-approvals and quick-lane bolts. While the plugin releases often, each `upgrade` is an owner prompt with nothing to decide: the pinned copy comes only from the installed release. Can the owner delegate it too?

## Decision Drivers
* The owner decides what has something to decide; a prompt with nothing in it is noise.
* A downgrade, or an upgrade over uncommitted work, still has something to decide.

## Considered Options
* A third delegated class, `upgrade`.
* Keep every upgrade an owner prompt.

## Decision Outcome
Chosen option: "A third delegated class, `upgrade`", because it removes a prompt with nothing to decide and keeps the two that have something.
* `aidlc delegate upgrade` writes the class into `approvals.auto` in the personal profile, beside 0008's two.
* With it delegated, the guard lets the lead run the installed plugin's `upgrade` between bolts without a prompt; `--downgrade` and `--dirty` still ask the owner.
* The session-start status says which applies. The owner still chooses when the plugin itself is updated.

### Consequences
* Good, because a run of releases no longer stops the lead at each one.
* Bad, because a delegated upgrade lands without the owner seeing it at the moment; the session-start status and the merge history show it.

### Confirmation
The guard allows `upgrade` without a prompt only while `upgrade` is delegated, and always asks for `--downgrade` and `--dirty`.

## More Information
It extends [0008](0008-delegated-approvals.md), whose first approvals of intents, plans, requirements and one-way doors stay with the owner.
