---
type: Design
title: Plan lint codes
description: Every code plan lint reports, with its fix (a warning is marked); drawn from grid.codes in cli.json and the extensions' data.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Code | Fix |
|---|---|
| `PLAN-DAG` | remove the cycle or point depends at an existing bolt |
| `PLAN-AC` | give each AC in the bolt its own AC-<k> |
| `PLAN-LEVEL` | write - AC-<k> (<level>): with a level from profile.levels |
| `PLAN-RESERVE` | use <kind> <area>/<n> with a kind from profile.reserve and a number no other bolt holds |
| `PLAN-SCOPE` | give the bolt a scope, narrow the scopes, or add a depends between the bolts |
| `PLAN-SHARED` | drop it from the scope: merge regenerates indexes and the log and runs profile.regen for shared files |
| `PLAN-REQ` | cite the requirements the intent or bolt serves: requirements: [R-<n>] |
| `PLAN-TEST` | add a scope glob where the level's tests live, give the AC a level whose paths the scope holds, or add /.aidlc/profile.json to the scope so the bolt adds its test location to levels |
| `PLAN-MODULE` | name a module from profile.modules, or add the module to the profile |
| `PLAN-DEPENDS` | add the other bolt to depends, or move the AC to that bolt |
| `PLAN-RUN` (warning) | add levels.<level>.run to .aidlc/profile.json, at least for unit and e2e |
| `PLAN-PLATFORM` | find how the target is run today (an infra repo, its GitOps set-up, namespaces, registries, access) and list it in deploy.platform in .aidlc/profile.json, as paths or URLs; [] when this project defines its own target |
| `PLAN-CARD` (warning) | shorten the bolt doc (ACs, Interfaces, Out of scope) or the project rules before the approval: card renders only an approved doc |
| `PLAN-SKELETON` (warning) | cut a walking skeleton first: an early bolt that builds the top-level test harness and the thinnest real path through every stage, with a top-level AC; then each increment adds a top-level AC for what it adds |
| `PLAN-RUNBOOK` | link a Runbook doc from the intent (template .aidlc/templates/docs/runbook.md: how to roll back, what to watch, who to call) |
| `PLAN-BOLT` | move the work item to bolts/ as B-<n> (aidlc new bolt "<title>"); units/ holds only the bolts a v1 plan approved (docs: Increments and bolts) |
| `PLAN-INCREMENT` | list the intent's increments under # Increments, each line opening with I-<n>.<k> and naming its bolts with a top-level AC among them, the walking skeleton first; no bolt waits on a later increment or a fix bolt (move what an increment needs into it); an intent without the section is one increment and runs end to end once with a top-level AC (or endToEnd: "<why>" outside every module and one-way door); a bolt crossing modules is tested at integration or higher (docs: Increments and bolts) |
| `PLAN-DESIGN` | write the section before approval: Domain names the entities, the one domain owning each and how domains interact; Logical the services, interfaces and data shapes this bolt changes. Or set design: "<why none>" when the bolt adds no domain or logic |
| `PLAN-GENERATED` | add the missing globs to the scope (the profile's generated entry pairs outputs with sources), or scope the tracked file instead of the untracked one |
| `PLAN-DECISION` | link a Decision doc from the bolt (template .aidlc/templates/docs/decision.md: options, choice, why), for the owner to approve with it, or set twoWay: "<why it is easy to undo>" in its frontmatter |
| `PLAN-BOARD` | add the planned value to the bolt's frontmatter, as the example shows |
| `PLAN-SLICE` | list under slices only the vertical slices the bolt delivers, each a Command or Query line of its bound domain's # Surface; a bolt that binds a horizontal module lists none (docs: Vertical slices checked) |
