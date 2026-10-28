---
type: Decision
title: 0019 The lead works in role personas
description: While it elaborates with the owner, the lead takes on a role persona (a product analyst for requests and requirements, an architect for domains and decisions) with that role's knowledge files; no extra agents and no simulated meetings, and every result is still checked by the CLI.
status: accepted
date: 2026-10-27
decision-makers: the owner
consulted: the lead
informed: projects, through upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T15:00:00Z }
---

# The lead works in role personas

## Context and Problem Statement
The owner's request often comes from someone who is not an engineer, in plain prose. Turning that into requirements, stories, domains and decisions takes a product analyst's and an architect's craft. The skill alone does not carry it, and the overview listed "PM/tech-lead/architect personas" among the non-goals. Should the lead take on such roles while it elaborates?

## Decision Drivers
* Plain prose from anyone must become good requirements.
* The owner stays in the loop: elaboration is a conversation, not a hand-off.
* Small prompts and the CLI's checks stay the guarantee (decision 0013).

## Considered Options
* Inline role personas: the lead works in the role with its knowledge files.
* Role subagents (an analyst, an architect) dispatched by the lead.
* No personas: knowledge files and CLI checks only.

## Decision Outcome
Chosen option: "Inline role personas", because the role's craft reaches the conversation while the owner answers the questions, and nothing new runs on its own ([Intake](../design/intake.md)).

### Consequences
* Good, because requirements, stories and decisions are written with a role's method and checklists.
* Good, because no agent runs out of the owner's sight, and the overview's non-goal narrows to "no simulated multi-agent meetings".
* Bad, because the lead reads a persona and its knowledge per elaborate step, which costs context; each persona is held to the 3 KB budget.

### Confirmation
`next` names the persona for each elaborate step. A test holds each persona to the prompt budget. The CLI's checks (coverage, sources, EARS, Given/When/Then, the advisory review) judge the result, whoever wrote it.

## More Information
The reference AI-DLC workflows run most stages this way, inline with the lead's persona.
