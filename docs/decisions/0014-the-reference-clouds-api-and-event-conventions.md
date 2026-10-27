---
type: Decision
title: 0014 The reference cloud's API and event conventions
description: The naming registry ships, as the default grammar for every project's contracts and events, the control-plane API rules of the public cloud the owner chose as reference, and its system-event naming sent as CloudEvents 1.0.
status: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:20:00Z }
---

# The reference cloud's API and event conventions

## More Information
The reference cloud's published sources, read on 2026-10-26:
- its API review rules and API linter rule docs (2026-10);
- its REST API guidelines (2026-08);
- its docs on asynchronous operations, resource names and event schemas;
- the CloudEvents 1.0.2 specification.

The open points were then checked live on 2026-10-27, with read-only calls plus one probe resource group, created and deleted with the owner's yes.

## Context and Problem Statement
The owner asked (2026-10-26) to use what the reference cloud uses for API casing (plan decision D3) and event types (D4). The cloud has two rulebooks: its resource manager's for the control plane, and general guidelines for data planes. The data-plane guidelines prefer kebab-case paths and an `Operation-Location` header. The projects this plugin serves are control planes and the services behind them.

## Considered Options
1. **The resource manager's control-plane rules, and its system-event naming.**
2. The data-plane guidelines. Their paths and long-running operations differ from what a resource-manager-style front door serves.
3. A house style. It would not be what the owner asked for.

## Decision Outcome
Option 1. The naming registry (M16) ships these as the default grammar; a project overrides one only by its own naming decision.
- **Paths:** `[/<scope>]/providers/<Namespace>/<type>/{<typeName>}…[/<action>]`.
  - The namespace is PascalCase `<Org>.<Service>`. Types are camelCase and plural.
  - Parameters are full names. A PUT path has an even segment count. Nesting goes at most 3 levels deep.
  - Every namespace serves `/providers/<Namespace>/operations`, the permission catalogue.
  - IDs and paths match case-insensitively and are echoed in their stored casing (verified live).
- **Operation IDs:** `Noun_Verb` with one underscore. Verbs are `Get`, `List`, `ListBy<Parent>`, `CreateOrUpdate`, `Update`, `Delete`, or the POST action's name.
- **api-version:** `YYYY-MM-DD` or `YYYY-MM-DD-preview`, each new version later than all others. An unknown version gets `InvalidApiVersionParameter`, listing the supported ones (verified live).
- **JSON:**
  - Properties are lowerCamelCase, with acronyms written as words. Enum values are PascalCase and extensible.
  - Booleans name a state, with no `is` prefix. Times end in `At`, references in `Id`.
  - The envelope is `id`, `name`, `type`, `location`, `tags`, `properties`, `systemData`. `systemData` is required from version 1, though the cloud's older APIs lack it.
  - `provisioningState` ends as `Succeeded`, `Failed` or `Canceled`. Lists are `value` plus `nextLink` (verified live).
  - The error envelope is `{"error":{"code","message","details","additionalInfo"}}`, with PascalCase codes (verified live).
- **Permissions:** `<Namespace>/<type>[/<type>…]/<read|write|delete|action>`, listed at `/providers/<Namespace>/operations` with a display block (verified live).
- **Long-running operations:**
  - A synchronous create answers `201` with the body.
  - An asynchronous operation answers `202` with `Location` (an opaque operation-result URL) and `Retry-After`, polled until `200` or `204`.
  - An operation-status resource is added only where clients need progress. The status header some of the cloud's services add is set per service, not by the resource manager (verified live on a resource-group delete).
- **Events:**
  - Types are `<Org>.<Service>.<Noun><PastTenseVerb>`. Control-plane outcomes are `<Org>.Resources.Resource<Write|Delete|Action><Success|Failure|Cancel>`, the nine the cloud emits for resource groups and subscriptions (verified live).
  - They are sent as CloudEvents 1.0. `source` is the publisher's resource ID and `subject` is the target's.
  - The type carries no version. A breaking payload change gets a new `dataschema` URI ending `/v<N>`; a change of meaning gets a new type.
- **Not copied:** the cloud's legacy deviations, all found live:
  - 5 lower-case namespaces, and many all-lower-case types;
  - about 1,500 `api-version` values with suffixes other than `-preview`;
  - `Cancelled`;
  - one service's `.V2` event suffix.

A resource-manager-style control plane has one widely used public reference, and following it removes a whole class of naming choices. The rules come from the cloud's own review rules and linter, and the live API confirmed the open points.

### Revisit when
The cloud republishes its resource provider contract (its public repository was archived on 2026-07-28), or a project's API is a data plane.
