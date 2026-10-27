---
type: Design
title: Naming
description: Names composed from a registry, never invented - tokens, domains, closed vocabularies and banned words in the profile, a grammar per kind of name with the reference cloud's API and event rules as default, names printed by the CLI, and rules generated from the registry and checked on code, contracts and docs.
status: stable
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
- **Module IDs** (`PROFILE-NAMING`): a module of kind `domain` whose id is not a registered domain code, or a pipeline or foundation module whose id is not in its vocabulary. A v2 profile without `naming.tokens.system` is one too, and a profile with modules but no registry a warning.
- **Generated rules** (`GATE-NAME`, B162): with a registry, the gate reads `naming.generated` rules beside the project's own: migrations under a registered domain, images and namespaces in `deploy/` composed from the tokens and vocabularies, and `banned`, no new path with a banned word as a segment. Identifiers are left to review: a banned word inside one (`baseUrl`) is too often legitimate.
- **The project's rules** (`GATE-NAME`): a `names` rule has `id`, `files` globs, `pattern` (the full name), an optional `find` regex whose first group is the name on an added line (without one, the rule checks each path the bolt adds or renames), and `why`, the decision that sets it. Only added lines count, so a rule needs no baseline. A rule without `id`, `files` or `pattern`, or with a regex that does not compile, is `PROFILE-NAMES`. A project keeps `names` only for kinds the grammar does not cover.
- `TERM-SYNONYM` (gate, B163): a domain doc's glossary entry lists its synonyms (`- **term** (not: a, b): meaning`); a synonym on an added line of the bolt's diff outside the domain docs is reported. The entries generate `naming/glossary.md` (type Glossary, written by the CLI with its digest) at every merge and by `aidlc map`.
- `CONTRACT-NAME` (`check` and the gate, B165): with a registry, each OpenAPI document under `naming.contracts` (default `api/**/openapi*`) is read and checked against the API grammar: a dated `info.version`, camelCase path segments, a PascalCase dotted namespace after `providers`, full parameter names ending in `Name` or `Id`, an even segment count on PUT paths, `Noun_Verb` operation IDs, lowerCamel properties, no `is` booleans, PascalCase enums, `systemData` on a resource and `nextLink` on a list.
- The card's `## Names` (B164) lists, beside the rules for its scope, the names the bolt will create for each registered domain module it names (schema, database role, path, write permission, created event), printed in advance from the grammar (`naming.cardKinds`); a kind the registry cannot compose yet is left out.

# Replaces
`names.md` (B162): its rule format, card section and profile check live on above; the hand-written rules a project needed for every kind become generated ones.

Bolts: [M16](../roadmap/m16.md) B160 to B165.
