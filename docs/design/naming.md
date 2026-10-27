---
type: Design
title: Naming
description: Draft - names composed from a registry, never invented - tokens, domains, closed vocabularies and banned words in the profile, a grammar per kind of name with the reference cloud's API and event rules as default, names printed by the CLI, and rules generated from the registry and checked on code, contracts and docs.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T03:00:00Z }
---

# Why
On `resource-manager` (2026-10-26) names were invented on the spot: "front door", "portal", "store", "endpoint". Each project wrote its own regexes, and the convention lived in a doc a builder met only when a check failed. An enterprise convention is a grammar over registered tokens: the components and their order, the casing and separator, the uniqueness scope, a regex and a worked example per kind ([0014](../decisions/0014-the-reference-clouds-api-and-event-conventions.md)).

# Registry
The profile's `naming` is the one source. The CLI adds its defaults (`cli.json` `naming`) under what the project sets.
```json
"naming": {
  "tokens": { "org": "acme", "system": "rsm", "zone": "example.internal" },
  "domains": { "providers": { "name": "Provider registration", "abbr": "prv" } },
  "vocabularies": { "role": ["api", "worker", "job", "ui", "cli", "agent", "gateway"] },
  "banned": ["manager", "service"]
}
```
- **Tokens.** `system` is a short code (2-6 lower-case letters or digits); `org` and `zone` are DNS labels. `init` asks for them.
- **Domains.** A domain's code is the plural noun of its root aggregate, lower case, the same word as its folder, schema and resource type. A domain doc's `code` registers it too ([Bundle v2](bundle.md)).
- **Vocabularies.** Closed lists: `role`, `env`, `pipeline` (request-path stages), `foundation` (shared kits), `verb`. A new word is a registry change the owner approves.
- **Banned.** Words that are never a name or part of one: metaphors and catch-alls. The project list adds to the default.
- `PROFILE-NAMING` reports a malformed token, a domain code that is not a lower-case word, a vocabulary word that is not one, and a domain or vocabulary word that is banned.

# Grammar
Each kind of name is a template over tokens in `cli.json` `naming.grammar`, with its regex and an example. `aidlc name <kind> --domain <code> --role <role> --env <env> …` prints the name, so a builder never composes one. The kinds: domain folder and package, slice folder, operation ID, API path, api-version, permission, event type, schema, database role, table, migration, deployable, image, namespace, host, metric and config key. The API and event kinds follow [0014](../decisions/0014-the-reference-clouds-api-and-event-conventions.md); the workload identity is never composed: it comes from a platform fact.

# Checks
- `NAME-UNREGISTERED`: a module of kind `domain` whose id is not a registered domain code, or a pipeline or foundation module whose id is not in its vocabulary.
- `NAME-BANNED`: a banned word as a path segment, or as a word of an identifier, on an added line or path of a bolt's diff.
- `GATE-NAME`: the project's own `names` rules, still read as before; M16 generates them from the grammar for the kinds the project's stack pack places (M17).
- `TERM-SYNONYM`: a glossary entry lists its synonyms (`- **term** (not: a, b): meaning`); a synonym on an added line of code or docs is reported.
- `CONTRACT-NAME`: a published OpenAPI document breaks the API grammar (paths, operation IDs, api-version, property and enum casing, the resource envelope with `systemData`, `value` and `nextLink`, the error envelope).
- The card's `## Names` lists the names the bolt will create, printed in advance from its modules.

# Replaces
`names.md`: hand-written regexes per project become generated rules; a project keeps `names` only for kinds the grammar does not cover.

Bolts: [M16](../roadmap/m16.md) B160 to B165.
