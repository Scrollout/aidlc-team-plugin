---
type: Decision
title: 0005 Deployments converge by re-applying
description: "A deployment resolves a template into a graph of idempotent writes through the front door and recovers from a failure by applying the same template again, not by compensating."
status: proposed
oneWayDoor: false
---

# Deployments converge by re-applying

## Context and Problem Statement
A deployment touches many providers, and any write can fail halfway. Undoing what succeeded is hard to make correct for every provider. How does a failed deployment recover?

## Considered Options
* Converge: every write is idempotent, so re-applying the template finishes the job.
* Sagas: each write has a compensating undo, run in reverse on failure.
* All or nothing: block until every provider confirms.

## Decision Outcome
Chosen option: "Converge by re-applying", because writes are idempotent anyway (the idempotency rule holds every write bolt to it), a what-if shows the change before it is made, and a project adds compensation only by a decision of its own.
