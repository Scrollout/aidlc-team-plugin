---
type: Design
title: Docs check codes
description: Every code the docs check reports, with its fix (a warning is marked); drawn from okf.codes in cli.json and the extensions' data.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Code | Fix |
|---|---|
| `OKF-FM` | give the file a terminated --- block of YAML key: value pairs |
| `OKF-TYPE` | add a non-empty type: to the frontmatter |
| `OKF-INDEX` | run aidlc index |
| `OKF-LOG` | use ## YYYY-MM-DD date headings |
| `OKF-RUNTIME` | add runtime: (e.g. bigquery, python) |
| `HOUSE-INDEX-STALE` (warning) | run aidlc index |
| `HOUSE-DESC` (warning) | add title: and a one-sentence description: |
| `HOUSE-GENERATED` (warning) | add generated: { by: <producer>/<version>, at: <ISO 8601> } |
| `HOUSE-LINK` (warning) | point the link at an existing file or remove it |
| `DOC-SCHEMA` | add the keys the type requires (okf.bundle.schemas), use a value its list allows, and keep the doc in its type's folder (docs: Bundle v2) |
| `DOC-SLUG` | rename the file to its id and the slug of its title (lower case, hyphens, no apostrophes, at most 48 characters, cut at a word), keeping the id; aidlc new names new docs this way |
| `DOC-GENERATED` | never edit a generated doc: change what it is drawn from and let the CLI write it again (aidlc map, aidlc index, or the next merge); a request is never rewritten: restore it, and keep a changed request with a new aidlc intake |
| `HOUSE-SIZE` (warning) | split the doc or move detail into linked docs |
| `PROFILE-ARCH` | give each module its data globs and set architecture.graph (printing data edges) and architecture.data; add architecture.acyclic and each module's api (docs: Architecture model) |
| `PROFILE-NAMES` | write the naming decision from .aidlc/templates/docs/naming.md; give each pattern a names rule: id, files globs, pattern, and a find regex whose first group is the name (none for a rule on paths) |
| `PROFILE-RULE` | set docs.rules entries to a HOUSE-* code and one of error, warning, off |
| `CONTRACT-NAME` | follow the API grammar: full lowerCamel names, Noun_Verb operation ids, a dated api-version, camelCase segments and properties, PascalCase enums, and what the chosen model's contract adds (aidlc name path\|operation-id\|api-version) (docs: Naming) |
| `PROFILE-NAMING` | set naming.tokens (system: 2-6 lower-case letters or digits; org and zone: DNS labels), domains as lower-case plural nouns, vocabulary words as lower-case words, none of them banned (docs: Naming) |
| `PROFILE-KIND` | give each module its kind (domain, pipeline, foundation, adapter, runtime, extension or delivery), surfaces from client, server and events, and system as core and extensions globs (docs: Architecture model) |
| `PROFILE-KEY` (warning) | remove it, or use the key the profile doc names for what you meant |
| `MODEL-FORMAT` | give the model folder a model.json with name, title, description, layers and slice; layers and domains with unique ids and kinds from the vocabulary; rules of known types; contracts between known ids; decisions as Decision docs (docs: Models) |
| `PIPELINE-ORDER` | wire the stages in the model's order, or point model.wiring in the profile at the file and the pattern that name them (docs: Models) |
| `PROVIDER-CONTRACT` | declare each field the model's slice asks under the module's slice in the profile (docs: Models) |
| `LONG-RUNNING` | answer the flagged operation in one of the model's shapes, with its link and retry headers named in model.operations, and give a delete its no-content answer (docs: Models) |
| `EVENT-COVERAGE` | name the events each write operation emits under model.events.marker, each defined in the model.events.files (docs: Models) |
| `GRAPH-SELFTEST` | make the project's architecture.graph print every import and data edge, or set it to the plugin's: node .aidlc/bin/aidlc.mjs graph (docs: Stack packs) |
