---
type: Design
title: Intake
description: plain prose from anyone turned into AI-DLC work for any project - the request kept word for word, the pathway and stack detected, the lead in role personas, every claim tied to a source, corners settled, vague answers resolved, an advisory review before approval, and subagents that get exactly their brief.
status: stable
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
- **Models:** each model whose fit words the request holds, with its sentences and its slices, so stories are written per use case ([planned](vertical-slices.md#planned-before-built)).
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
Method 9, for intents in a v2 project:
- **The review:** before it offers the approval, `next` asks for an advisory review of the intent. `aidlc review I-<n>` prints the reviewer's brief: the request, the intent and its requirements, and what to check (testable requirements, ACs a tester could write tests from, scope, corners, contradictions, sources that do not say what is claimed).
- **The record:** the reviewer pipes its findings to `aidlc review record I-<n> -` with focus `intent`. The record keeps the hash of the intent and its requirements as they were reviewed.
- **The approval:** it refuses when no review matches the docs as they are now (`APPROVE-REVIEW`): hard on the review having happened.
- **The findings:** they stay advice. `next` lists them for the owner to weigh at the approval, and they block nothing: soft on the verdict.

# Agents get exactly their brief
- **The brief:** the `Agent` hook renders what the subagent reads and replaces the lead's prompt with it at launch:
  - a builder's: `Build B-<n>.` and the card;
  - a reviewer's: `Review B-<n>, focus <focus>.` and the card, or the intent review brief for `I-<n>`;
  - a researcher's: the research brief.

  The lead's prompt only names the target and the focus.
- **Effort:** each role's effort is `efforts.<role>` in the profile (build `high`, review `medium`, research `medium` by default), set on every launch; each agent's front matter carries the same as a fallback.
- **Finding ids:** the CLI numbers a bolt's review findings per focus (`F-<k>`). The next `fix` or `escalate` round answers each one the last round left open: listed again with its id while it holds, or named in `fixed`; one it leaves unanswered refuses the round. A `pass` answers them all.
- **Lead commands:** a subagent runs only its role's `aidlc` commands (`hooks.subagentCommands`); any other is `GUARD-SUBAGENT`.

# Brownfield
Method 10: the brownfield pathway adds two steps.
- **`business`:** the intent's `# Business transactions` lists what the existing code serves, one line each, naming the modules or domains it crosses (`- Order a cake: shop → billing`). A line naming none the profile or the bundle knows does not count.
- **`baseline`:** `baseline: [F-<n>]` cites a platform fact for each test level with a `run`, recorded with `aidlc fact "<level> baseline" --env base -- <its run>`. `fact` records only a passing command, so a fact is the suite passing on the base. The debt it shows goes under `# Debt`, one line each, or `- none: <why>`.

Bolts: [M22](../roadmap/m22.md) B213, B214, B218, B219, B220.
