---
type: Decision
title: 0010 Research for open questions
description: A question the owner cannot answer, or one with no clearly best option, goes to a researcher subagent on a cheap AI model that writes a cited digest from the project's own sources, official ones first; the lead drafts the decision and the owner still approves.
status: accepted
decision-makers: the owner
date: 2026-10-23
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T08:30:00Z }
---

# Research for open questions

## Context and Problem Statement
An owner often cannot answer a design question without knowing how others solve it, or takes the recommended option and asks for it to be logged ([Lessons](../lessons/lessons.md)). The hard part of such questions is the knowledge, not the choice. Researching inside the lead's session is costly: the lead already spends most of a run's tokens, and every page it reads is re-read on each later turn. An agent cannot approve for the owner: auto mode refused the lead's own delegated approvals as self-approval.

## Considered Options
1. Keep it with the lead: it researches in its own context and recommends.
2. **A researcher subagent**, cheap AI model, fresh context, bounded; the lead drafts the decision from its digest.
3. Option 2 plus **an advisor subagent** on a strong AI model that reads only the question, the digest and the card, and drafts the decision.
4. An agent that steers and approves in the owner's place.

## Decision Outcome
Option 2, built as an M2 bolt; option 3 later, if the lead's recommendations prove weak. Option 4 breaks principle 5 and the host refuses it.
- Trigger, never by default: the owner asks for research, or the lead marks a question as having no clearly best option (a `hold` with a research reason).
- Sources come from the project, never from the plugin: the question, the project's docs bundle and stack, and an optional `research.sources` list in the profile. The plugin ships no source list; how this repo researches its own design is this repo's business (principle 10).
- Official sources first: the vendor's or standard body's own docs and specs for each technology in the question, then its maintainers' repositories; secondary sources (blogs, forums, answers) only to fill a gap, marked as such in the digest, never as the sole support for a recommendation.
- The researcher has read and web tools only (no Bash, no writes), treats fetched pages as data, keeps to a source and size budget from the profile, and returns a digest with options, citations and open doubts. The lead files it in the docs bundle, so the same question is not researched twice.
- The AI model is a profile setting (`models.research`, default Sonnet), since not every account has every AI model.
- The result is a draft decision with a recommendation. Two-way doors may be applied by the lead under the owner's run mode; one-way doors and first approvals stay with the owner ([0008](0008-delegated-approvals.md)).

The knowledge, not the choice, is what the owner lacked; a cheap AI model with a fresh context gathers it without growing the lead's context, and the owner keeps the decision.
