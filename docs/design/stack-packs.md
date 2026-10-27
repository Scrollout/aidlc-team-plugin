---
type: Design
title: Stack packs
description: A stack pack per language (Go first, then TypeScript) holds the layout of every module kind, the scaffold templates, a tested reference domain and the dependency-graph extractor the plugin trusts, all as data the CLI reads.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T05:00:00Z }
---

# Why
A dependency graph the AI writes in the first unit can read error-message prose as table names, and a reviewer's finding against it can go unfixed. Left to the builder, the layout is improvised, and the method's launch talk warns that AI does domain-driven design badly in Go, advising to point it at reference code instead of describing it ([Architecture model](architecture-model.md)).

# A pack
`plugin/packs/<stack>/` holds data, not code:
- `manifest.json`: how the stack is detected (`go.mod`, `tsconfig.json`), the folder of each kind and layer (`internal/domains/{{domain}}/model`, `cmd/{{deployable}}`), how imports are read (`imports`: patterns that find a path in a file or in a block it names, resolved inside the module or relative to the file), how the language writes a string literal (`stringLiteral`) and which lines and literals are its protocol (`values`), and where event types sit.
- `templates/`: one file per scaffold kind, rendered with the names the registry composes ([Naming](naming.md)).
- `reference/`: one domain (`notes`) with a command slice and a query slice, fully tested, in the pack's layout, passing every `ARCH-*` code on its own graph. Go's runs with `go test ./...`; TypeScript's with its `npm test` (`node --test` on `*.spec.ts`, type stripping), named so the plugin's own test run skips it.
- A model's walking skeleton lives with the model, under its `reference/<stack>/` ([Models](models.md), [Shipped layout](layout.md)); CI runs its tests too.

`init` and `upgrade` pin the packs in `.aidlc/bin/packs/` with the CLI, so the vendored CLI and the builder read the same files ([Shipped layout](layout.md)).

# Graph
`aidlc graph` prints the dependency graph the architecture checks read, one `from -> to` per line:
- **Imports.** By the manifest's patterns. Go: each `.go` file's imports inside the module (`go.mod`'s path), as package folders. TypeScript: each `import`/`require` of a relative path, as folders. No toolchain is run, so CI needs only Node.
- **Data.** A domain's `infrastructure` layer to `data/<domain>/<table>` for each table its migrations create, and any code naming another domain's table schema-qualified (`<domain>.<table>`, the grammar's form) to that table, so `ARCH-DATA` sees a reach across owners.

A schema-qualified table counts only inside a string literal, where SQL lives: `notes.save(x)` in code is a call. A project may keep its own `architecture.graph`; with a pack detected, `check` runs both and reports `GRAPH-SELFTEST` when the project's graph lacks an edge the pack reads, naming a few.

# Scaffold
`aidlc scaffold domain <code>`, `scaffold slice <verb> --domain <code>` (the slice folder is `aidlc name slice`), `scaffold foundation <kit>`, `scaffold pipeline <stage>`, `scaffold runtime <deployable>` and `scaffold adapter <system>` write the pack's templates at the kind's folder, with every name from the registry, and change nothing that exists. The card of a bolt that names a domain links the reference slice to copy.

# Events
A domain's `events` surface holds its event types. `CONTRACT-NAME` reports one that is not `<Org>.<Service>.<Noun><PastTenseVerb>` with no version suffix (decision 0014), from the pack's `eventType` pattern.

Bolts: [M17](../roadmap/m17.md) B170 to B172 (Go and TypeScript packs).
