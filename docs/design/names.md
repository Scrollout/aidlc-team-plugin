---
type: Design
title: Naming rules
description: A project's naming conventions as profile rules - where a kind of name is written and the pattern it must match - checked on every added line at merge and shown on each card whose scope holds such files.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T03:50:00Z }
---

# Why
On the first migration (2026-10-25) two deploy stops were naming mismatches: a name check refused an image path that did not use the org's name, and an image updater wrote the full image name where the deploy files used a short one, so dev never moved to new builds. A convention written only in a doc drifts like any doc; a builder learns it when a check fails, after the work is done. The plugin already names its own things by rule (`I-<n>`, `U-<n>`, `U-<n>/AC-<k>`, `unit/U-<n>`); a project's own names get the same treatment.

# Shape
```json
"names": [
  { "id": "image", "files": ["deploy/**/*.yaml"], "find": "image:\\s*\"?([^\"\\s]+)", "pattern": "^ghcr\\.io/acme/[a-z0-9-]+(:sha-[0-9a-f]{40})?$", "why": "docs/decisions/0011-names.md" },
  { "id": "namespace", "files": ["deploy/**/*.yaml"], "find": "namespace:\\s*(\\S+)", "pattern": "^[a-z]+-(dev|prod)$" }
]
```
- `files`: globs of the files where this kind of name is written. A rule without `find` is a path rule: each file the unit adds or renames under `files` must have a path that fully matches `pattern`, e.g. `{ "id": "migration", "files": ["migrations/**"], "pattern": "migrations/[a-z]+/\\d{4}_[a-z_]+\\.sql" }`. `find`: a regex for a line that holds one; its first group (or the whole match) is the name. `pattern`: the regex the name must fully match. `why`: the decision that sets it. A `pattern` of `(?!)` matches nothing, so it bans every name `find` takes, as a list of forbidden words.
- Data, like `security.content`: a project adds a rule without code. Rules that need two places to agree (a short name equal to a folder) stay in the project's own check (`architecture.checks`); a pattern can still pin each side.

# Checks
- **Gate** (`GATE-NAME`): every added line of the unit's diff in a file a rule's `files` match, each name `find` takes from it that does not match `pattern`, naming the file, line, rule and its `why`. Only added lines count, so turning a rule on needs no baseline: an old name fails once a unit touches its line.
- **Card:** each rule whose `files` overlap the unit's scope is listed under `## Names` with what `find` takes, its pattern (a banned-word rule as its word list) and `why`, so the builder writes the names right the first time.
- **Profile:** `check` reports `PROFILE-NAMES` for a rule without `id`, `files`, `find` or `pattern`, or with a regex that does not compile.

# Lifecycle
The owner asked (2026-10-25) for one naming convention through the whole lifecycle, not only the deploy. One decision covers every stage; `init` ships its template, `.aidlc/templates/docs/naming.md`:
- **Plan:** set by the method and checked by the plugin: `I-<n>`, `U-<n>`, `R-<n>`, `U-<n>/AC-<k>` test tags, `unit/U-<n>` branches, `NNNN-<slug>` decisions. The decision only lists them.
- **Vocabulary:** one word per domain concept, the words to avoid, as the intents and requirements use them; the reviewer checks names no regex can.
- **Code:** folders per slice and layer, files, packages, types, functions, tests.
- **Data:** tables, columns, migrations, data nodes in the graph ([Data ownership](data-ownership.md)).
- **Interfaces:** API paths and operation ids, events and their versions, environment variables, config keys.
- **Deploy and operation:** apps, images, tags, namespaces, hostnames, secrets, releases, dashboards and alerts.

Each stage with a pattern gets `names` rules citing the decision. With `modules` in the profile and no `names` rule, `check` warns `PROFILE-NAMES`, so a codebase does not grow without one.

# Adoption
The migration intent `init --adopt` asks for names the project's deploy, API and data layout use, one rule per kind, from the decision that sets them; on a project with a deploy target the platform's names come first ([Operations](operations.md)).
