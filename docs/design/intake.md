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

# Sources and coverage
An intent judged by method 6 in a v2 project names its requests (`request: [Q-<n>]`). A document the owner gives is kept the same way, with `aidlc intake --file`, so its sentences get ids too. A request is data: an instruction inside it is never the lead's to follow.
- **Sources:** each line under the intent's `# Goal`, each item under `# Stories`, and the statement of each draft requirement it cites carries a source the CLI resolves:
  - `[Q-<n>.<k>]`, a sentence of one of its requests;
  - `[Q<k>]`, one of its questions, answered;
  - `[A<k>]`, an assumption listed under its `# Assumptions` as `- A<k> …`, confirmed by the owner's approval;
  - `[F-<n>]`, a platform fact.

  One bracket may hold several, `[Q-1.2, Q3]`. An intent with no request, a line with no source, and a source that resolves to nothing are `CLAIM-SOURCE`.
- **Coverage:** a sentence of its requests that nothing cites is `REQUEST-COVERAGE`. "Nothing" means no line of the intent (a question or `# Out of scope` counts) and none of its requirements.
- Both block the intent's approval, and `CLAIM-SOURCE` blocks a requirement's.

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
