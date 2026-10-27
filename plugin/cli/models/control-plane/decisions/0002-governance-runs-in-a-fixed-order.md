---
type: Decision
title: 0002 Governance runs in a fixed order
description: "Authenticate, authorize, policy, lock and throttle run in that order on every write, before the provider sees it; the provider's own validation runs only after all pass."
status: proposed
oneWayDoor: true
---

# Governance runs in a fixed order

## Context and Problem Statement
A request can be refused for several reasons. When the order is an implementation detail, the same request is refused differently in different places, and a cheap check runs after an expensive one. In what order do the stages run?

## Considered Options
* authenticate, authorize, policy, lock, throttle, then the provider.
* Each provider orders its own checks.
* Throttle first, to shed load early.

## Decision Outcome
Chosen option: "authenticate, authorize, policy, lock, throttle", because a caller learns who they are before what they may do, policy judges the result before a lock or a budget is spent, and every refusal is the same everywhere. Quota, if the project has it, is the project's own choice of stage or of the provider's.

### Confirmation
The stage-order rule reads the wiring the profile names and fails on any other order.
