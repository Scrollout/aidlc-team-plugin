---
type: Decision
title: 0003 The core records every resource
description: "A resources domain in the core keeps the metadata of every resource (id, kind, scope, provider), written on every provider write and reconciled with the provider."
status: proposed
oneWayDoor: true
---

# The core records every resource

## Context and Problem Statement
Listing by scope, cascade delete, an index, events and policy compliance all need to know which resources exist. If only each provider knows, every one of those features asks every provider. Who knows what exists?

## Considered Options
* A core resources domain holds the metadata of every resource; providers hold their state.
* Each provider answers for its own resources; the core asks them.
* A search index fed by events only.

## Decision Outcome
Chosen option: "A core resources domain", because the cross-cutting features read one place, and the provider stays the owner of its own state.

### Confirmation
An integration test creates a resource through a provider and finds it listed by its scope, then deletes the scope and finds it gone.
