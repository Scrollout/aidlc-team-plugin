---
type: Design
title: Values as data
description: Draft - nothing hard-coded, in the plugin and in every project it governs - values in data, code holding only logic, tool protocol and keys, a test for the plugin and a gate check for projects, and the board as a declarative JSON template.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T23:00:00Z }
---

# Why
The board's issue shape, pathway names, factor names, file names and message fragments were literals in code. A literal changes only with a release, and a project cannot see or override it (principle 11; the owner, 2026-10-27).

# The line
- **Data:** every name, word, heading, path, prefix, pattern, threshold, default, mapping and message, and the grammars of the docs (headings, list items, AC and requirement forms). It lives in `cli.json` for the core, in `extension.json` for an extension, in a template file, or in the profile when only the project knows it.
- **Code:** logic; the protocol of the tools it calls (git subcommands and flags, `gh` and HTTP verbs, Node encodings and hash names); and keys into the data (data keys, message keys, check codes).

# The guard
A test scans every module of the CLI for string and regex literals. One passes only when it is a key into the data, a message key or a check code, or is listed as tool protocol in `tests/fixtures/protocol.json`. Anything else fails, naming the file, the line and the literal.

# In projects
The rule holds in every project the plugin governs (the owner, 2026-10-27: "Never use hard-coded data, not in AIDLC plugin nor in any project using AIDLC plugin").
- **The constitution** a project gets from `init` and `upgrade` holds the rule and names its check.
- **The builder** keeps every value in the project's data files; **the reviewer** reports a literal value as a finding.
- **`VALUE-LITERAL`** at the merge gate: a string literal on a line the bolt adds to a source file is a finding, unless the file is a test, lies under the profile's `values.data` globs (where the project keeps its values), or the literal matches the stack pack's protocol list or the profile's `values.allow`. Each stack pack names how its language writes a string literal. Only added lines count, so existing code is measured as it changes.

# The board as a template
`board.json`, the board extension's default, and a project's `.aidlc/board.json` over it, describe the whole board:
- **Per item kind** (intent, bolt, fix):
  - its title and body templates;
  - its labels, from front-matter paths, and the labels the plugin set that no longer apply are removed;
  - its type, milestone and parent;
  - its assignees, from a front-matter path with a default;
  - its relationships: `depends` as blocked-by links, added and removed to match the plan.
- **The Project:** each field with its type (single select and its options, number, date, text, iteration). `sync` creates a missing field or option, refuses a field of the wrong type, and writes an iteration by its title or start date.
- **Values:** each field's value from a front-matter path or a derived value, with a value map, as `github.fields` did.

`sync` renders the template; the code that wrote the issue shape is gone.

Bolts: [M26](../roadmap/m26.md) B235, B236, B237, B238.
