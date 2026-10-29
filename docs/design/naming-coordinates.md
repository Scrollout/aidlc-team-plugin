---
type: Design
title: Naming coordinates
description: Every name of a slice composed from one set of coordinates - system, domain, resource, verb and cut - and checked by a rule the registry generates for each kind of name that says where its names appear, with the kind's length, character class and uniqueness scope.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-29T15:00:00Z }
---

# Why
A hand-written naming rule restates the grammar as a regex: one per kind (tables, permissions, integration events; slice folders already have `SLICE-NAME`), each drifting from the names `aidlc name` prints until a fix round aligns them. The grammar already composes those names, so the registry derives the rules from the same coordinates.

# Coordinates
A slice is one point in five coordinates, and each of its names is a template over them ([Naming](naming.md#grammar)):

| Coordinate | From | Example |
|---|---|---|
| system | `naming.tokens` `system` and `org` | `shop`, `Acme.Shop` |
| domain | a registered domain code | `providers` |
| resource | the domain's noun in each form (`domainForms`) | `provider`, `Providers` |
| verb | `naming.vocabularies.verb` | `create` |
| cut | a layer of the slice, a key of the pack's `slicePaths` | `interface` |

- The slice folder: domain, resource and verb (`createprovider`), one sub-folder per cut ([0029](../decisions/0029-a-slice-holds-its-own-layers.md)).
- The integration event: system, resource and verb (`Acme.Shop.ProviderCreated`); the permission: system, resource and an action (`Acme.Shop/providers/write`).
- The API operation id, path, database schema, database role and table: system, domain and resource, with the verb where the kind needs it.

# Open kinds
The plugin's grammar, the stack pack's `naming` block, the architecture model's `model.grammar` and the project's `naming.grammar` each may add a kind; the registry merges the union of their kinds field by field, in that order. A new kind needs `template` and `regex` (`PROFILE-NAMING` reports one without), and `aidlc name` prints it.

# Generated rules
A kind that says where its names appear gets a rule `GATE-NAME` reads beside the project's own `names`, on a bolt's added lines and paths; `check --tree` runs it over every tracked file:
- `files`: the globs it looks in. `find`: a regex whose first group is the name on an added line; its `{{token}}` and `{{Namespace}}` are filled from the registry, so it looks only at the project's own names. `path`: a path rule's full path, `{{name}}` the composed name.
- The pattern: when every token the kind needs is a registry token or comes from a closed list (domains, `verb`, `action`, `role`, `env`, metric units), the alternation of every name the registry composes; otherwise the kind's `regex`. A `find` with `{{Namespace}}` looks at every namespace: the project's own names must be composed ones, another namespace's (an extension's) match the kind's `other` shape, else its `regex` (an integration event's ends in a past participle). A kind's `nest` (`at`, `pattern`) lets child segments in before its last `at`, as a permission's nested types. An integration event's verb takes its past participle from `naming.pastTense`, else `naming.pastRules`, else the suffix. A path rule with an open token is not generated.
- Defaults are data. `table`, stack-neutral in `cli.json`, finds `create table <name>` in `migrations/**/*.sql`. Each stack pack's `naming` block says where its language writes `event` and `permission` literals; a slice folder's name is `SLICE-NAME`'s, which checks it against the names the registry composes ([Vertical slices](vertical-slices.md)).
- The migration, image, namespace and banned rules stay as they are; a project keeps `names` only for what no kind covers.

# Constraints
- `max`: the longest name, in characters.
- `class`: a character class from `naming.classes`, which a project may extend: `dns-label`, `lower-alnum`, `lower-snake`.
- `scope`: where the name is unique, one of `naming.scope.values`: global, region, account, group, namespace.

`aidlc name` refuses a composed name over `max` or outside its class. `PROFILE-NAMING` reports an unknown class or scope, and warns of a `global` kind whose template and needs hold none of `naming.scope.unique` (`system`, `org`, `instance`): two projects could compose the same name.

Bolts: [M30](../roadmap/m30.md) B267.
