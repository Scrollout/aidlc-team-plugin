---
type: Design
title: Domain words
description: The canonical words at the domain scale, each with its one meaning, the AI-DLC term it maps to and where it is declared; drawn from the vocabulary in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|
| domain | a bounded context holding the vertical slices of one business capability, with its data, language, contract and events | a Domain Design component | `domains/<code>.md`, module `kind: domain` |
| aggregate | entities changed together behind one root; a domain is named after its root | Domain Design | the `model` layer |
| domain model | a domain's entities, rules and domain events, depending on no other layer | Domain Design | the `model` layer |
| data node | one piece of stored data, owned by one module | - | module `data`, `data/<domain>/<table>` |
| contract | the published API a domain or an extension serves | integration specification | the contract files, model `contracts` |
| integration event | a past-tense, versioned fact a domain publishes to others | - | the domain doc's `Events:` line |
| domain event | a fact between one domain's aggregates, inside its model | Domain Design | the `model` layer |
| kind | `domain`, `pipeline`, `foundation`, `adapter`, `runtime`, `extension` or `delivery` | - | module `kind` |
