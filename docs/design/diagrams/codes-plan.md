---
type: Design
title: Plan lint codes
description: Every code plan lint reports, with its fix (a warning is marked); drawn from grid.codes in cli.json and the extensions' data.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Code | Fix |
|---|---|
| `PLAN-DAG` | remove the cycle or point depends at an existing unit |
| `PLAN-AC` | give each AC in the unit its own AC-<k> |
| `PLAN-LEVEL` | write - AC-<k> (<level>): with a level from profile.levels |
| `PLAN-RESERVE` | use <kind> <area>/<n> with a kind from profile.reserve and a number no other unit holds |
| `PLAN-SCOPE` | give the unit a scope, narrow the scopes, or add a depends between the units |
| `PLAN-SHARED` | drop it from the scope: merge regenerates indexes and the log and runs profile.regen for shared files |
| `PLAN-REQ` | cite the requirements the intent or unit serves: requirements: [R-<n>] |
| `PLAN-TEST` | add a scope glob where the level's tests live, give the AC a level whose paths the scope holds, or add /.aidlc/profile.json to the scope so the unit adds its test location to levels |
| `PLAN-MODULE` | name a module from profile.modules, or add the module to the profile |
| `PLAN-DEPENDS` | add the other unit to depends, or move the AC to that unit |
| `PLAN-RUN` (warning) | add levels.<level>.run to .aidlc/profile.json, at least for unit and e2e |
| `PLAN-PLATFORM` | find how the target is run today (an infra repo, its GitOps set-up, namespaces, registries, access) and list it in deploy.platform in .aidlc/profile.json, as paths or URLs; [] when this project defines its own target |
| `PLAN-CARD` (warning) | shorten the unit doc (ACs, Interfaces, Out of scope) or the project rules before the approval: card renders only an approved doc |
| `PLAN-SKELETON` (warning) | cut a walking skeleton first: an early unit that builds the top-level test harness and the thinnest real path through every stage, with a top-level AC; then each slice adds a top-level AC for what it adds |
| `PLAN-RUNBOOK` | link a Runbook doc from the intent (template .aidlc/templates/docs/runbook.md: how to roll back, what to watch, who to call) |
| `PLAN-BOLT` | move the work item to bolts/ as B-<n> (aidlc new bolt "<title>"); units/ holds only the units a v1 plan approved (docs: Increments and bolts) |
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
| `PLAN-INCREMENT` | list the intent's increments under # Increments, each line opening with I-<n>.<k> and naming its bolts with a top-level AC among them, the walking skeleton first; no bolt waits on a later increment or a fix bolt (move what an increment needs into it); an intent without the section is one increment and runs end to end once with a top-level AC (or endToEnd: "<why>" outside every module and one-way door); a bolt crossing modules is tested at integration or higher (docs: Increments and bolts) |
| `PLAN-DESIGN` | write the section before approval: Domain names the entities, the one component owning each and how components interact; Logical the services, interfaces and data shapes this unit changes. Or set design: "<why none>" when the unit adds no component or logic |
| `PLAN-GENERATED` | add the missing globs to the scope (the profile's generated entry pairs outputs with sources), or scope the tracked file instead of the untracked one |
| `PLAN-DECISION` | link a Decision doc from the unit (template .aidlc/templates/docs/decision.md: options, choice, why), for the owner to approve with it, or set twoWay: "<why it is easy to undo>" in its frontmatter |
| `BOLT-BIND` | bind the bolt to one domain in modules, or to one horizontal module with neededBy: B-<v> naming a bolt of the same increment that binds a domain (docs: Construction by proof) |
| `BOLT-SPAN` | split the bolt into one bolt per domain, or move it to increment 1, the walking skeleton (docs: Construction by proof) |
| `INCR-SKELETON` | put on increment 1 a bolt with a top-level AC and a bolt binding the delivery module, so the skeleton runs end to end on its target (docs: Construction by proof) |
| `FIX-SHAPE` | give the fix bolt exactly one AC, a regression test that fails before the fix, and a scope outside the decisions and one-way doors; a design change goes through a decision and an increment (docs: Construction by proof) |
| `HATCH-EXPIRED` | close the escape hatch (merge or drop the fix bolt, end the waiver, supersede the exception), or the owner sets a later until (docs: Construction by proof) |
| `PLAN-BOARD` | add the planned value to the unit's frontmatter, as the example shows |
