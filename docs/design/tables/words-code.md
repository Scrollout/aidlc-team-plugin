---
type: Design
title: Code words
description: The canonical words at the code scale, each with its one meaning, the AI-DLC term it maps to and where it is declared; drawn from the vocabulary in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|
| vertical slice | the code of one use case, a command or a query, cutting through every horizontal layer it needs; it names the use case it serves | a user story, cut through all layers | a `Command` or `Query` line of its domain doc's `# Surface` |
| command | a use case that changes state | - | a `Command` line of `# Surface` |
| query | a use case that reads state, answering with a view | - | a `Query` line of `# Surface` |
| route | a slice's entry in its domain's interface layer | - | `interface/<slice>` |
| handler | a slice's use case code, with its validator | - | `application/<slice>/` |
| declaration | what a slice states in one grammar: its cuts, then its data, entry, permission, async, emits, consumes and calls | - | a domain doc's `# Surface` line, a unit of work's `Slices` line |
| cut | a layer a vertical slice cuts through, from the stack pack's `slicePaths` | - | a slice's declaration |
| entry | the runtime serving a slice, and what it applies to each | - | a slice's `entry` |
| hand-off | an integration event or a call between domains | - | `emits`, `consumes`, `calls` |
| permission | what a caller needs for a slice, enforced at its entry | - | a slice's `permission` |
| surface | what a domain offers others: its commands, queries and integration events | integration specification | the domain doc's `# Surface`; the profile's `surfaces` |
| test level | a named set of tests with its paths and run command | - | profile `levels` |
| acceptance criterion | a Given/When/Then a bolt's tests prove, tagged with its id | - | a bolt's `AC-<k>`, `B-<n>/AC-<k>` |
| proof-revert | the gate's run with the bolt's code reverted, which must fail | - | `aidlc merge` |
| mutation | a change to code that a test must catch, for a bolt that changes only tests | - | a report's `mutations` |
| scope | the paths a bolt may change | - | a bolt's `scope` |
| value | a name, pattern, default, mapping or message, kept in data, never in code | - | `cli.json`, a project's `values.data` |
