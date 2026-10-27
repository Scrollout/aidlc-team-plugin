---
type: Design
title: Intent and bolt codes
description: Every code plan lint on intents, decisions and bolts reports, with its fix (a warning is marked); drawn from grid.codes in cli.json and the extensions' data.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Code | Fix |
|---|---|
| `PATHWAY-SKIP` | declare the intent's pathway (greenfield, feature, brownfield) and complete each step it requires before approval (docs: Inception) |
| `INTENT-SIZE` | split the intent: at most 5 increments and 5 domains, each increment with its own success measure |
| `ELAB-OPEN` | ask the owner and record the answer under the question: - Answer: <letter> … |
| `ELAB-BARE` | record which option the owner chose, by its letter, then any words of theirs |
| `DOMAIN-DATA` | give the table one owning domain; the others read it through that domain's client or events |
| `DOMAIN-TERM` | give the term one meaning, or qualify it per domain (an order in sales, a purchase order in buying) |
| `DOMAIN-REQ` | name the domains the requirement belongs to in its domains: key |
| `FACT-MISSING` | probe the target with aidlc fact "<title>" -- <read-only command> and cite the fact in the decision's facts: |
| `FACT-STALE` | probe again with aidlc fact and cite the new fact |
| `DOC-AMEND` | restore the approved decision and write a new one with supersedes: <its number>; approving it marks the old one superseded |
| `DECISION-HORIZON` | decide it when its increment is next but one; keep the intent's decisions to the increments being built |
| `DESIGN-COHERENCE` | make the decisions agree: one domain per transaction and per table, dependencies the kind table allows, or a superseding decision |
| `DOC-REF` | point the key at an existing doc of the right type, or remove it |
| `BOLT-BIND` | bind the bolt to one domain in modules, or to one horizontal module with neededBy: B-<v> naming a bolt of the same increment that binds a domain (docs: Construction by proof) |
| `BOLT-SPAN` | split the bolt into one bolt per domain, or move it to increment 1, the walking skeleton (docs: Construction by proof) |
| `INCR-SKELETON` | put on increment 1 a bolt with a top-level AC and a bolt binding the delivery module, so the skeleton runs end to end on its target (docs: Construction by proof) |
| `FIX-SHAPE` | give the fix bolt exactly one AC, a regression test that fails before the fix, and a scope outside the decisions and one-way doors; a design change goes through a decision and an increment (docs: Construction by proof) |
| `HATCH-EXPIRED` | close the escape hatch (merge or drop the fix bolt, end the waiver, supersede the exception), or the owner sets a later until (docs: Construction by proof) |
| `CLAIM-SOURCE` | name the requests the intent comes from (request: [Q-<n>]) and give each goal line, story and requirement statement a source in brackets: a request sentence [Q-<n>.<k>], an answered question [Q<k>], an assumption [A<k>] listed under # Assumptions, or a fact [F-<n>] (docs: Intake) |
| `REQUEST-COVERAGE` | cite each sentence of the request where the intent or a requirement answers it, or under # Out of scope with the reason (docs: Intake) |
