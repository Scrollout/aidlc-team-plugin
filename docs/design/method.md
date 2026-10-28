---
type: Design
title: Build method from day one
description: How a project gets the build method on its first init - level runs asked at init, a constitution that names the check behind each rule, and an upgrade that adds what an older project lacks.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T08:00:00Z }
---

# Words
The words the method uses at each scale, and which rules are AI-DLC's and which the plugin's own: [Canonical model](canonical-model.md).

# Why
An initialised project must get the method: vertical slices, an end-to-end test per intent, tests first. The checks exist, but on a fresh project the ones that run tests stay off: `init` writes no `levels.*.run`, so the gate runs no level, proof-revert has nothing to revert against and the end-to-end rule is silent. No doc in the docs bundle states the method, and `upgrade` gives an older project none of the templates added since its `init`.

# Shape
1. **Level runs:** the lead asks the owner how each test level runs, offering what `init` detects (a `test` script in `package.json`, a `test` target in a `Makefile`, `go test ./...` beside `go.mod`; the map lives in `cli.json`), and passes `--run <level>=<command>`, once per level. `init` writes `levels.<level>.run`; it never writes a detected command on its own. Plan lint reports `PLAN-RUN`, a warning, while no level has a `run`.
2. **Constitution:** `init` renders `<bundle>/constitution/principles.md` (type `Principles`): a few rules, each naming the codes that enforce it, and a place for the project's own. AGENTS.md points to it. The docs bundle's indexes are regenerated after `init` writes.
3. **Upgrade:** besides `.aidlc/bin`, `upgrade` adds each doc template the project lacks and the constitution when the docs bundle holds no `Principles` doc. It never overwrites a file and names each one it added.

# Choices
Chosen: the lead asks and offers detected commands, nothing guessed into the profile; upgrade adds the constitution only when none exists.

Bolts: [M7](../roadmap/m7.md).
