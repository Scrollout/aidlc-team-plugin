---
type: Decision
title: 0001 Derived state
description: Progress is computed from git and the docs bundle; there is no ledger, event log or handoff file.
status: accepted
date: 2026-10-22
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Derived state

## Context and Problem Statement
State the AI model must remember to record drifts: a call it skips goes unaudited, a ledger grows without bound, and a handoff file turns into an append-only pile. The reference AI-DLC workflows keep a state file and an audit file the AI model updates. Where does the plugin keep progress?

## Decision Drivers
* Nothing a forgotten call can leave out of date.
* A new session or machine resumes from a clone alone.

## Considered Options
* A state file the AI model maintains, as the reference workflows do.
* A ledger of each step, audited later.
* **Derive progress from git and the docs bundle.**

## Decision Outcome
Chosen option: "Derive progress from git and the docs bundle", because nothing recorded apart from the work can drift from it: approvals sit in front matter, progress in branches and merge trailers.

### Consequences
* Good, because resuming on another machine needs only a clone.
* Bad, because the CLI re-reads git on each call, milliseconds at this scale.

## More Information
Revisit when `status` takes over 500 ms on a real project.
