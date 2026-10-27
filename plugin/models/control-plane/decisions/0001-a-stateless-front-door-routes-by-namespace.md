---
type: Decision
title: 0001 A stateless front door routes by namespace
description: "Every request enters through one stateless front door, which runs the governance stages and routes to the provider that owns the namespace."
status: proposed
oneWayDoor: true
---

# A stateless front door routes by namespace

## Context and Problem Statement
Many providers serve resources behind one API. Without a single entry, each provider re-implements identity, permissions, policy and limits, and they drift apart. How do requests reach providers?

## Considered Options
* One stateless front door that governs every request and routes by namespace.
* Each provider exposes its own endpoint and governs itself.
* A shared library each provider links in.

## Decision Outcome
Chosen option: "One stateless front door", because every rule is enforced once, the same way, and the door scales out because it keeps no state.

### Consequences
* Good, because every rule is enforced once, in one place, and a provider ships only its own resources.
* Bad, because the front door is on every request path, so it must scale out and stay up; a namespace without a registered provider is refused there.

### Confirmation
A test sends a request for an unknown namespace and gets a not-found from the door, never from a provider; the stage-order rule holds the governance wiring.
