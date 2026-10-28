---
type: Decision
title: 0018 Standard formats over home-made ones
description: Decisions follow MADR 4.0, acceptance criteria read as Given/When/Then, requirements are written in EARS, releases are logged per Keep a Changelog with SemVer, and architecture docs follow arc42 with C4 levels; the plugin checks each format the way it checks its own.
status: accepted
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T13:00:00Z }
---

# Standard formats over home-made ones

## Context and Problem Statement
The plugin's decisions, criteria, requirements, history and architecture docs each had a format of the plugin's own. They were close to published standards, but a reader, tool or new team member familiar with those standards had to learn the plugin's variant. Which published standards should replace them, and how far do they reach?

## Decision Drivers
* A format people and tools already know.
* Checkable by the CLI, as every other rule is (decision 0013).
* No churn for what is already approved: an approved decision is never edited (`DOC-AMEND`, [docs bundle](../design/bundle.md#decisions)).

## Considered Options
* MADR 4.0, Given/When/Then, EARS, Keep a Changelog with SemVer, arc42 with C4.
* Nygard's original ADR format, with the other formats unchanged.
* Keep the plugin's own formats and document that they are ADR-like.

## Decision Outcome
Chosen option: "MADR 4.0, Given/When/Then, EARS, Keep a Changelog with SemVer, arc42 with C4", because each one is a published standard and maps onto a doc type the plugin already checks ([Standard formats](../design/standards.md)).

### Consequences
* Good, because a decision, a criterion or a requirement reads the same as anywhere else these standards are used.
* Good, because each format is a doc schema the CLI checks: the sections a decision or system doc needs, the shape of an AC line and of a requirement.
* Bad, because docs approved before keep their old form; the rules judge only drafts and intents approved under method 5.

### Confirmation
`DOC-SCHEMA` reports a decision or system doc missing a section its standard requires. `PLAN-AC` reports an AC without Given/When/Then, and `PLAN-REQ` a requirement not in an EARS pattern. A test holds the plugin's own changelog to Keep a Changelog, and its arc42 page to the 12 sections.

## Pros and Cons of the Options

### MADR 4.0, Given/When/Then, EARS, Keep a Changelog with SemVer, arc42 with C4
* Good, because every format the plugin writes is a published one.
* Bad, because five formats change at once, so the bolts land one at a time.

### Nygard's original ADR format
* Good, because it is the smallest.
* Bad, because it has no Considered Options section, which the one-way-door review reads.

### Keep the plugin's own formats
* Good, because nothing changes.
* Bad, because every reader and tool must still learn the plugin's variants.

## More Information
MADR 4.0 (adr.github.io/madr). Keep a Changelog 1.1.0. arc42 (arc42.org). C4 (c4model.com). EARS: Mavin et al., RE'09.
