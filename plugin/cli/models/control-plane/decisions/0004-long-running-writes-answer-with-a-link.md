---
type: Decision
title: 0004 Long-running writes answer with a link
description: "A write a resource type declares long-running answers at once with a link to follow: created with a status link, or accepted with a result link, always with a retry hint, until a terminal state."
status: proposed
oneWayDoor: false
---

# Long-running writes answer with a link

## Context and Problem Statement
Some writes take minutes. Holding the connection open fails at proxies and wastes capacity. How does a client learn the outcome of a slow write?

## Considered Options
* Answer at once with a status or result link and a retry hint.
* Hold the connection until the write finishes.
* Push the outcome to a callback the client registers.

## Decision Outcome
Chosen option: "A status or result link", because clients poll at the pace the retry hint sets, the front door stays stateless, and the shapes are the ones the long-running rule checks.
