---
type: Design
title: Bundle v2
description: Draft - the project's OKF bundle as AI-DLC's context memory - one folder per closed doc type, authored and generated docs kept apart, a front-matter schema per type, typed references, decisions superseded never amended, CLI-made ids and slugs, and errors on the base.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Why
On `resource-manager` (2026-10-26) the bundle drifted in five ways:
- Hand-drawn architecture pages disagreed with the generated map.
- Three decisions were amended in place to match the code.
- Indexes were stale on main.
- Slugs were cut mid-word.
- Relations lived only in prose links.

Every agent reads the bundle before it acts, so it must be true. OKF v0.2 conformance stays as it is ([OKF](okf.md)). v2 adds producer keys and house rules only.

# Layout
| Folder | Type | Class |
|---|---|---|
| `constitution/` | Principles | authored, owner-approved |
| `method/` | Method | generated from the intent's pinned method version |
| `system/` | System | authored: core, extensions, and why the shape is what it is |
| `domains/` | Domain | authored, one per bounded context, `<code>.md` |
| `intents/`, `bolts/`, `requirements/` | Intent, Bolt, Requirement | authored |
| `decisions/` | Decision | authored, immutable once approved |
| `platform/` | Fact | authored by `aidlc fact` |
| `research/`, `runbooks/` | Research, Runbook | authored |
| `naming/` | Naming, Glossary | generated from the registry and the domains' glossaries |
| `architecture/` | Map | generated only: context map, containers, codebase tree, dependency graph, kinds × layers, traceability |

`DOC-GENERATED` refuses two things:
- a hand edit to a generated doc;
- a generated type in an authored folder.

Pictures of the structure exist only in `architecture/`, drawn from declarations.

# Schemas
Each type's required keys live in `cli.json` and are checked as `DOC-SCHEMA`:

| Type | Required keys |
|---|---|
| Intent | `pathway`, `method`, `requirements`, `domains`, `increments` |
| Domain | `code`, `kind`, `owns`, `surface`, `relationships`, `glossary` |
| Bolt | `intent`, `increment`, `binding`, `scope`, `acs`, `fix` |
| Decision | `affects`, `options`, `chosen`, `supersedes`, `facts`, `oneWayDoor` |
| Fact | `command`, `environment`, `digest`, `at`, `settles` |
| Requirement | `acs`, `domains` |
| Research | `question`, `heldOn`, `sources` |

# References
- Relations are front-matter IDs, checked as `DOC-REF`: the target must exist and be of the right type.
- Prose links stay for reading only.
- Indexes list who cites each doc.
- A generated traceability page per intent links requirement → AC → bolt → test → gate run → release (M19).

# Decisions
- An approved decision can't be edited (`DOC-AMEND`).
- A change is a new decision with `supersedes`. The CLI marks the old one `superseded` with `superseded_by`.
- When code already exists for what it `affects`, the new decision gives `reason: code-first`, and `retro` counts it.

# Names in the bundle
- IDs come from `aidlc new <type> "<title>"`.
- Slugs are generated (`DOC-SLUG`): lower case ASCII, hyphens, no apostrophes, at most 48 characters, cut at a word boundary, no trailing hyphen.
- A description is one sentence of at most 200 characters.
- The glossary and banned-word checks cover doc bodies.

# On the base
- `HOUSE-INDEX-STALE`, `HOUSE-LINK` and `DOC-*` are errors in `check --ci` and at the gate.
- `DOC-STATUS` reports a design doc that is still draft though all its bolts are built.
- Every merge regenerates the generated folders in the trial merge.

# Reading budget
- Type caps stay, and every doc opens with a one-line TL;DR.
- A card loads only the docs its references resolve to.
- Facts and research carry `stale_after`.

# Migration
The brownfield step:
- moves `units/` to `bolts/`, with aliases kept;
- replaces hand-drawn architecture docs with `system/` plus generated pages;
- lists decisions amended in place in a baseline decision;
- renames malformed slugs, keeping their IDs.

`upgrade` reports each move first.

Bolts: [M15](../roadmap/m15.md) B156-B158; [M18](../roadmap/m18.md) B177, B181.
