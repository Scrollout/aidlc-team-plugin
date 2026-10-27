---
type: Design
title: Standard formats
description: Decisions in MADR 4.0, acceptance criteria as Given/When/Then, requirements in EARS, releases in Keep a Changelog with SemVer, and architecture in arc42 with C4 levels, each checked by the CLI on drafts and on intents approved under method 5.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T13:00:00Z }
---

# Why
The owner asked for standardized methods ([0018](../decisions/0018-standard-formats-over-home-made-ones.md)). Each format below maps onto a doc type the plugin already has. Approved docs keep their form: an approved doc is never edited.

# Decisions: MADR 4.0
- The template is MADR's: `# <title>`, then `## Context and Problem Statement`, `## Decision Drivers`, `## Considered Options`, `## Decision Outcome` with `Chosen option: "<option>", because <why>`, `### Consequences` and `### Confirmation`, `## Pros and Cons of the Options` and `## More Information`. The bundle's keys (`type`, `title`, `description`) and the plugin's (`affects`, `oneWayDoor`, `supersedes`, `facts`, `serves`) sit beside MADR's front matter (`status`, `date`, `decision-makers`, `consulted`, `informed`).
- Status: `proposed` while a draft; approving sets `accepted` and `date`; approving a successor sets the old one to `superseded by ADR-<NNNN>`.
- `DOC-SCHEMA`: a draft decision in a v2 project lacking Context and Problem Statement, Considered Options or Decision Outcome. A one-way door also needs Confirmation: how the decision is checked.

# Acceptance criteria: Given/When/Then
An AC line keeps its tag and level: `- AC-<k> (<level>): Given <context>, when <action>, then <outcome>.` `Given` may be left out. `PLAN-AC` reports an AC with no `when` and `then`, on bolts and requirements of a v2 project judged by method 5.

# Requirements: EARS
A requirement states what must hold in one of EARS's patterns under `# Requirement`:
- `The <system> shall <response>.`
- `When <trigger>, the <system> shall <response>.`
- `While <state>, the <system> shall <response>.`
- `If <trigger>, then the <system> shall <response>.`
- `Where <feature>, the <system> shall <response>.`
- `While <state>, when <trigger>, the <system> shall <response>.`
`PLAN-REQ` reports a draft requirement whose statement fits none.

# Releases: Keep a Changelog and SemVer
`init` writes `CHANGELOG.md` with an `## [Unreleased]` section, and the plugin keeps its own the same way: newest first, `## [<x.y.z>] - <YYYY-MM-DD>`, changes grouped under Added, Changed, Deprecated, Removed, Fixed and Security. A test holds the plugin's changelog to the version in `plugin.json`. The bundle's `log.md` stays the OKF log of the docs.

# Architecture: arc42 and C4
- A system doc follows arc42's 12 sections, from 1 Introduction and Goals to 12 Glossary. Generated pages fill some: the building block view is the codebase map by kind, decisions are the decisions index, the glossary is the naming glossary. `DOC-SCHEMA` reports a draft system doc missing one.
- Generated maps name their C4 level where one fits: the module dependency graph and the map by kind are component views. The context map is a domain-driven design context map, not a C4 context view.
- The plugin's own architecture is laid out the same way in [Architecture in arc42](arc42.md), with a generated component view of the CLI.

Bolts: [M20](../roadmap/m20.md) B208, B209, B210, B211, B212.
