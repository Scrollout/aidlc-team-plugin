---
type: Design
title: Inception
description: A deterministic Inception - a pathway per intent with the steps it requires, a sized intent whose questions are answered by option, domain docs and a generated context map, platform facts probed on the target, structured decisions within a horizon and superseded never amended, a coherence check over them, a recorded design review, and one-way doors approved one at a time.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T06:00:00Z }
---

# Why
On `resource-manager` (2026-10-26) 21 decisions were approved in 20 seconds, two pairs contradicted each other, decisions were amended in place to match code, and the cluster's identity form was assumed, not probed. AI-DLC's safeguard is human validation of what the AI proposes; these rules make it real ([0015](../decisions/0015-one-way-doors-are-approved-one-at-a.md)).

# Pathways
An intent declares `pathway`: `greenfield`, `feature`, `brownfield`, `model` ([Models](models.md#modelling-a-reference)) or `defect` (`cli.json` `inception.pathways`). Each names the steps it requires before the intent is approved; a missing one is `PATHWAY-SKIP`, which blocks the approval:
- `questions`: every question answered (below).
- `domains`: a domain doc for each code in the intent's `domains`.
- `facts`: each decision the intent cites with `affects.platform` cites a fact.
- `map`, `kinds`: brownfield reverse engineering: the codebase map written, every module with a kind.
- `business`, `baseline` (method 10): the business transactions the code serves, and the suite passing on the base with its debt noted ([Intake](intake.md#brownfield)).
A defect is a fix bolt, never an intent.

# A sized intent with real answers
- `INTENT-SIZE`: more than 5 increments, or more than 5 `domains`.
- `# Questions`: `- Q<k> <question>`, its options as `  - <letter>) <option>: <consequence>`, and `  - Answer: <letter> …`. A question with no answer, or answered "not decided", is `ELAB-OPEN`; an answer that names no option letter (a bare "yes") is `ELAB-BARE`.

# Domains
A domain doc's `# Owns` lists its tables and `# Relationships` its neighbours with their pattern ([Bundle v2](bundle.md)). `DOMAIN-DATA`: a table two domains own. `DOMAIN-TERM`: one glossary term with two meanings in two domains. `DOMAIN-REQ`: a requirement the intent cites that names no domain. The context map (`architecture/context-map.md`) is drawn from the relationships at every merge.

# Platform facts
`aidlc fact "<title>" -- <command>` runs a read-only command on the target and writes `platform/F-<n>-<slug>.md` with the command, environment, output digest, date and the output. `FACT-MISSING`: a decision with `affects.platform` that cites no fact in `facts`. `FACT-STALE`: a cited fact older than `facts.maxAgeDays` (default 30).

# Decisions
- Front matter: `affects` (`domains`, `data`, `transactions`, `dependencies`, `platform`), `oneWayDoor`, `supersedes`, `facts`, `serves` (the increments it is for).
- `DOC-AMEND`: an approved decision edited. A change is a new decision with `supersedes`; approving it marks the old one superseded.
- `DECISION-HORIZON`: a draft decision that serves only increments beyond the next two of its intent.
- `DESIGN-COHERENCE`, over the approved and draft decisions' `affects`: a transaction across two domains; a dependency the kind table forbids; a table owned by two domains, or by a horizontal module; two decisions giving one key two values without `supersedes`.

# Approval
- The design review: before the owner approves an intent's decision set, a reviewer's architecture pass is recorded with `aidlc review record I-<n>`; a CONFIRMED finding blocks approval of the intent and its one-way doors until `aidlc dispose I-<n> F-<k> fixed|accepted "<reason>"` (`APPROVE-OPEN`).
- `APPROVE-BULK`: `approve` naming two or more one-way doors.

# References
A decision's `facts` and `supersedes` must resolve to a doc of the right type (`DOC-REF`); an intent's requirements and a bolt's depends keep `PLAN-REQ` and `PLAN-DAG`. The intent rules hold in a v2 project for intents judged by method 3 (`method.since`), so an intent approved before keeps its rules.

Bolts: [M18](../roadmap/m18.md) B173 to B181.
