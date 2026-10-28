---
type: Decision
title: 0027 Integration event names stay in the plugin's grammar
description: Decision 0021 superseded 0014 and moved only the API's resource hierarchy into the control-plane architecture model, saying nothing of integration events; the plugin's grammar keeps their names as <Namespace>.<Noun><PastTenseVerb>, sent as CloudEvents, for every project.
status: proposed
date: 2026-10-28
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T15:00:00Z }
sources:
  - id: event-schema
    resource: https://learn.microsoft.com/en-us/azure/event-grid/event-schema
    title: Event Grid event schema
  - id: cloudevents
    resource: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
    title: CloudEvents 1.0.2
---

# Integration event names stay in the plugin's grammar

## Context and Problem Statement
Decision 0014 set both the API grammar and the integration event names. Decision 0021 superseded it and moved the API's resource hierarchy into the control-plane architecture model, but said nothing of integration events. The grammar still names them (`naming.grammar.event`) and `CONTRACT-NAME` still checks the integration event types a domain's `events` folder defines, with no live decision behind either. Which rule names integration events now?

## Decision Drivers
* The plugin works for any project: no one system's shape in its defaults.
* Every check rests on a live decision.

## Considered Options
* Keep the integration event name in the plugin's grammar: `<Namespace>.<Noun><PastTenseVerb>`, sent as CloudEvents 1.0.
* Move it into the control-plane architecture model's API contract, as 0021 did with the resource hierarchy.

## Decision Outcome
Chosen option: "Keep the integration event name in the plugin's grammar", because a past-tense fact under the publisher's namespace is not one system's shape: it is the form the reference cloud's published integration event types share, and CloudEvents, a vendor-neutral standard, carries it in its `type` attribute.
* `<Namespace>` is the project's organisation and system (`Org.System`); the noun is the domain's singular; the verb is in the past tense; no version suffix.
* The CloudEvents envelope carries the type; `source` names the publishing domain.

### Consequences
* Good, because every project's integration events read alike, and the check has a live decision.
* Bad, because a project whose integration events follow another convention overrides the `event` kind in its profile's `naming.grammar`.

### Confirmation
`CONTRACT-NAME` reports an integration event type that breaks the grammar, and `aidlc name event` composes it.

## More Information
Supersedes nothing; it covers the part of 0014 that 0021 left without a decision ([0021](0021-the-control-planes-api-conventions-belong-to-its.md)).
