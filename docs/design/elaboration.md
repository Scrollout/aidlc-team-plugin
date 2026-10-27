---
type: Design
title: Elaboration checks
description: Draft - what the CLI checks while the lead elaborates an intent with the owner - every claim sourced, every request sentence covered, the corner checklist settled, vague answers followed up, and the owner's read-back confirmed.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T18:00:00Z }
---

# Why
A plan written from plain prose drifts from it unless each claim says where it came from, each sentence of the request is answered, the unstated corners are settled and the owner confirms what was understood ([Intake](intake.md)).

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
Method 7, for intents in a v2 project:
- **Corners:** the checklist's surfaces are data (`intake.corners`). The intent's `# Corners` has a line for each, `- Input: R-2, [A1]`, settled by a requirement or bolt id, a source, or `n/a:` or `out of scope:` and a reason. A missing or unsettled surface is `ELAB-CORNER`.
- **Vague answers:** an answer whose words hold a vague term ("maybe", "depends", "fast enough") is `ELAB-VAGUE`, and needs a follow-up.
- **Not decided:** "not decided" stays an open question (`ELAB-OPEN`), in every method.
- **Read-back:** the last question is `- Q<k> Read-back: <the summary>`, with options *looks correct* and *request changes*. Until the owner picks *looks correct*, it is `ELAB-OPEN`. It is separate from the review and the approval.

# Personas and stories
When the request names two or more kinds of user, the intent lists `# Personas` and `# Stories` ("As a <persona>, I want…, so that…"), each story citing requirements.

Bolts: [M22](../roadmap/m22.md) B215, B216, B217.
