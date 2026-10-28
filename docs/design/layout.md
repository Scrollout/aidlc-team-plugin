---
type: Design
title: Shipped layout
description: Every content package at the top of the plugin folder holding all it owns, one pinned copy in a project laid out the same way, a project override at the same path under .aidlc, and one resolver for every lookup.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T17:20:52Z }
---

# Why
Content the plugin ships sits in three packages beside the engine ([0022](../decisions/0022-one-layout-for-shipped-content.md)). `cli.json` `packages` also names `models`, with a project override and no shipped folder: a project keeps its own architecture models ([0025](../decisions/0025-the-plugin-ships-the-model-format-not-models.md)).

# Layout
```
plugin/
  cli/              the engine: code, cli.json, defaults.json, extensions/<name>/ with their data and templates
  templates/        every template the CLI renders or copies: cards, fixes, research, intent reviews, docs, bundle
  personas/         the lead's role personas, beside agents/ and skills/
  packs/<stack>/    manifest.json, templates/, its own reference/
```

# Pinned and overridden
- `init` and `upgrade` copy the CLI to `.aidlc/bin/` and each package into `.aidlc/bin/<package>/` ([Vendoring](vendoring.md)). The entry stays `.aidlc/bin/aidlc.mjs`.
- A project's own file at the same relative path under `.aidlc/` wins: `.aidlc/templates/…`, `.aidlc/personas/…`; its architecture models are in `.aidlc/models/<name>/`. A CLI extension's template resolves the same way, its own folder being the shipped one.
- `cli.json` `packages` names each package, its folder and its override; one resolver serves templates, personas and packs: the pinned copy's folder if there is one, else the plugin's.
- `upgrade` removes a project's old `.aidlc/packs/`, which `.aidlc/bin/packs/` replaces.

Bolts: [M26](../roadmap/m26.md) B241.
