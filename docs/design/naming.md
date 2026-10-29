---
type: Design
title: Naming
description: Names composed from a registry, never invented - tokens, domains, closed vocabularies and banned words in the profile, a generic grammar per kind of name a project may override, names printed by the CLI, and rules generated from the registry and checked on code, contracts and docs.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-29T15:00:00Z }
---

# Why
Without a registry, names are invented on the spot ("front door", "portal", "store"), each project writes its own regexes, and the convention lives in a doc a builder meets only when a check fails. An enterprise convention is a grammar over registered tokens: the parts and their order, the casing and separator, the uniqueness scope, a regex and a worked example per kind ([0021](../decisions/0021-the-control-planes-api-conventions-belong-to-its.md)).

# Registry
The profile's `naming` is the one source. The CLI adds its defaults (`cli.json` `naming`) under what the project sets.
```json
"naming": {
  "tokens": { "org": "acme", "system": "shop", "zone": "example.internal" },
  "domains": { "providers": { "name": "Provider registration", "abbr": "prv" } },
  "vocabularies": { "role": ["api", "worker", "job", "ui", "cli", "agent", "gateway"] },
  "banned": ["manager", "service"]
}
```
- **Tokens.** `system` is a short code (2-6 lower-case letters or digits); `org` and `zone` are DNS labels. `init` asks for them.
- **Domains.** A domain's code is the plural noun of its root aggregate, lower case, the same word as its folder, database schema and resource type. A domain doc's `code` registers it too ([Docs bundle v2](bundle.md)).
- **Vocabularies.** Closed lists: `role`, `env`, `pipeline` (request-path stages), `foundation` (shared kits), `verb`. A new word is a registry change the owner approves.
- **Banned.** Words that are never a name or part of one: metaphors and catch-alls. The project list adds to the default.
- `PROFILE-NAMING` reports a malformed token, a domain code that is not a lower-case word, a vocabulary word that is not one, and a domain or vocabulary word that is banned.

# Grammar
Every kind with its template and tokens, generated: [Naming grammar](tables/naming-grammar.md).
Each kind of name is a template over tokens with its regex. A kind merges field by field over the plugin's defaults (`cli.json` `naming.grammar`), the stack pack's `naming` block, the profile's `model.grammar` (the chosen architecture model's, which `aidlc models apply` replaces whole) and the profile's `naming.grammar`, the project's own, which no apply touches; any layer may add a kind. `aidlc name <kind> --domain <code> --role <role> --env <env> …` prints the name, so a builder never composes one. The API and integration event kinds follow generic rules ([0021](../decisions/0021-the-control-planes-api-conventions-belong-to-its.md)); a workload identity comes from a platform fact.

# Coordinates
A slice's names compose from five coordinates: system, domain, resource (the domain's noun), verb and cut (the layer). The slice folder takes domain, resource and verb; the integration event and permission system, resource and a verb or action; the API kinds and tables domain and resource. A kind's `files` generate its rule, `max`, `class` and `scope` bound it: [Naming coordinates](naming-coordinates.md).

# Checks
- **Module IDs** (`PROFILE-NAMING`): a module of kind `domain` whose id is not a registered domain code, or a pipeline or foundation module whose id is not in its vocabulary. A v2 profile without `naming.tokens.system` is one too, and a profile with modules but no registry a warning.
- **Generated rules** (`GATE-NAME`, B162, B267): with a registry, the gate reads generated rules beside the project's own: migrations under a registered domain, images (a part: domain, stage or extension) and namespaces in `deploy/`, `banned` (no new path segment a banned word), and one per kind with `files` ([Naming coordinates](naming-coordinates.md#generated-rules)).
- **The project's rules** (`GATE-NAME`): a `names` rule has `id`, `files` globs, `pattern` (the full name), an optional `find` regex whose first group is the name on an added line (without one, the rule checks each path the bolt adds or renames), and `why`, the decision that sets it. Only added lines count, so a rule needs no baseline. `check --tree` runs them on every tracked file. A rule without `id`, `files` or `pattern`, or with a regex that does not compile, is `PROFILE-NAMES`. A project keeps `names` for what no kind covers.
- `TERM-SYNONYM` (gate, B163): a domain doc's glossary entry lists its synonyms (`- **term** (not: a, b): meaning`); a synonym on an added line of the bolt's diff outside the domain docs is reported. The entries generate `naming/glossary.md` (type Glossary, written by the CLI with its digest) at every merge and by `aidlc map`.
- `CONTRACT-NAME` (`check` and the gate, B165): with a registry, each OpenAPI document under `naming.contracts` (default `api/**/openapi*`) is read and checked against the API grammar: a dated `info.version`, camelCase path segments, full parameter names ending in `Name` or `Id`, an even segment count on PUT paths, `Noun_Verb` API operation IDs, lowerCamel properties, no `is` booleans, PascalCase enums. The chosen architecture model's `contract` adds its own ([0021](../decisions/0021-the-control-planes-api-conventions-belong-to-its.md)): the control-plane architecture model a dotted PascalCase namespace after `providers`, `systemData` on a resource and `nextLink` on a list.
- The card's `## Names` (B164) lists, beside the rules for its scope, the names the bolt will create for each registered domain module it names (database schema, database role, path, write permission, the integration event a create publishes), printed from the grammar (`naming.cardKinds`); a kind the registry cannot compose yet is left out.

Bolts: [M16](../roadmap/m16.md) B160 to B165, [M30](../roadmap/m30.md) B267.
