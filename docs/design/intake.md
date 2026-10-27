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
`aidlc intake "<prose>"` (or `--file <path>`) writes `requests/Q-<n>-<slug>.md`, a doc only the CLI writes. Under `# Request`, each sentence of the prose, word for word, is a line `- Q-<n>.<k> <sentence>`, with a blank line between paragraphs. Its body digest locks it, so a hand edit is `DOC-GENERATED` ([Bundle v2](bundle.md)).

# The proposal
Intake proposes the pathway, stack and lane, and the owner confirms or changes them. The proposal keys off a band per factor, never one summed score.

| Factor | Band from | Scored by |
|---|---|---|
| verification | a test level that runs, and CI: both low, one medium, none high | the CLI |
| risk | the request's risk words (money, personal data, security, deletion), each with its sentence | the CLI, raised by the lead |
| ambiguity | vague goals, missing acceptance, several readings | the lead |
| assumptions | decisions the request leaves unsaid | the lead |

- **The pathway comes from the project, not a band:** no code means greenfield, approved intents mean feature, and code with neither means brownfield. The stack is the pack whose detect file the project has.
- **The lane:** full when risk or verification is high, otherwise standard (`intake.fullWhen`).
- **Scoring:** the lead scores with `aidlc intake Q-<n> --ambiguity <band>:<ids> --assumptions <band>:<ids> --risk <band>:<ids>`. A medium or high band cites the sentences it rests on, and risk never goes below what the words show. The bands and their sentences sit in the request's front matter, outside the digest.
- **What the owner hears:** the lead tells them in two or three plain sentences what kind of change this is and how much process that calls for, then the proposal. The bands come only on request.
- **The intent records the outcome:** `request: Q-<n>`, `pathway`, and `lane`. An intent's `lane` is a floor for its bolts, which never run below it ([Grid](grid.md#lanes)).

# Roles
The lead elaborates in a role, with its knowledge (`plugin/cli/personas/`, so a project's pinned CLI carries them; each within 3 KB):
- **Product analyst:** request to intent, requirements in EARS, stories and personas, the corner checklist.
- **Architect:** domains, decisions in MADR, the increments and the bolt cut.
`next` names the role for each elaborate step. No other agent runs, and nothing is decided without the owner.

# Elaboration checks
Sources, coverage, corners and answers: [Elaboration checks](elaboration.md).

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

Bolts: [M22](../roadmap/m22.md) B213, B214, B218, B219, B220.
