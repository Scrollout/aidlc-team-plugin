---
type: Design
title: Intake
description: Draft - plain prose from anyone turned into AI-DLC work for any project - the request kept word for word, the pathway and stack detected, the lead in role personas, every claim tied to a source, corners settled, vague answers resolved, an advisory review before approval, and subagents that get exactly their brief.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T15:00:00Z }
---

# Why
A request often arrives in plain prose from someone who is not an engineer. Nothing kept their words, nothing checked that the plan covers them, and elaboration depended on the lead's skill ([0019](../decisions/0019-the-lead-works-in-role-personas.md)).

# The request
`aidlc intake "<prose>"` (or a file) writes `requests/Q-<n>-<slug>.md` with the prose word for word. Each sentence gets an id `Q-<n>.<k>`. The text is hash-locked: editing it is `REQUEST-AMEND`. Intake detects the pathway (no code: greenfield; code and no plan: brownfield; an approved plan: feature) and the stack (the packs' detection), and scores the request's risk from plain signals (tests and CI present, modules touched, words such as money, personal data, security). From these it proposes the pathway and lane; the owner confirms.

# Roles
The lead elaborates as a role, with the role's knowledge (`plugin/personas/`, each persona within 3 KB, its knowledge files beside it):
- **Product analyst:** request to intent, requirements in EARS, stories and personas, the corner checklist.
- **Architect:** domains, decisions in MADR, the increments and the bolt cut.
`next` names the role for each elaborate step. No other agent runs, and nothing is decided without the owner.

# Sources and coverage
- A line of the intent's goal, a requirement's statement and a story cite where they come from: `[Q-<n>.<k>]` for the request, `[Q<k>]` for an answer, or `[assumption]` for one the owner confirmed under `# Assumptions`. An unsourced line is `CLAIM-SOURCE`.
- A request sentence that nothing cites, neither a line nor `# Out of scope`, is `REQUEST-COVERAGE`. Both block the intent's approval.

# Corners and answers
- The corner checklist is data, per surface (input, data, identity, errors, scale, operations…). The intent's `# Corners` settles each surface its domains touch: a requirement or AC, an assumption, or out of scope. An unsettled one is `ELAB-CORNER`.
- An answer with a vague word ("maybe", "depends", "fast enough") is `ELAB-VAGUE`, and needs a follow-up. "Not decided" is an answer that stays an open question. Before the docs are written, the lead reads back a summary, and the owner's confirmation is recorded under `# Questions`.
- When the request names two or more kinds of user, the intent lists `# Personas` and `# Stories` ("As a <persona>, I want…, so that…"), each story citing requirements.

# Review before approval
`next` names an advisory review of the intent (`review I-<n>`, focus `intent`: testable requirements, ACs a tester could write tests from, scope boundaries, corners). Approval refuses without a recorded review for the docs' current hash (`APPROVE-REVIEW`). Findings stay advisory: the owner disposes of the confirmed ones, as for the design review.

# Agents get exactly their brief
- A hook renders the card or research brief from the CLI as the subagent's prompt, bound to the card's hash.
- A review round's findings keep their ids: the next round answers each, fixed or still open.
- A subagent cannot run the lead's commands (approve, merge, next).
- Each agent carries its effort, the reviewer's measured.
- Project rules can be scoped to a role.

# Brownfield
The brownfield pathway adds two steps: `business` (the transactions the code serves, drawn over the domains) and `baseline` (the suite passing on the base, its debt noted).

Bolts: [M22](../roadmap/m22.md) B213, B214, B215, B216, B217, B218, B219, B220.
