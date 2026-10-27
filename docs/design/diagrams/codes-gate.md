---
type: Design
title: Gate codes
description: Every code the merge gate reports, with its fix (a warning is marked); drawn from gate.codes in cli.json and the extensions' data.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Code | Fix |
|---|---|
| `GATE-APPROVAL` | the owner approves the bolt: they type approve <bolt> |
| `GATE-DEPS` | merge its dependencies first |
| `SCOPE-OUT` | move the change into scope, or the lead widens the scope and the owner re-approves |
| `GATE-LANE` | the lead raises the bolt's lane, re-renders the card and restarts the review |
| `GATE-AC` | add a test tagged with the AC |
| `GATE-LEVEL` | move the test under the level's paths in profile.levels, or add the paths the level lacks, in this bolt or in one merged before it |
| `GATE-CHECK` | fix the module until its check passes |
| `GATE-PROOF` | make each tagged test fail without the change, then report again |
| `GATE-SKIP` | run the level where its tests can run (set what it needs), or make the skipped test run; a skipped test proves nothing |
| `GATE-RUN` | the builder fixes the code or tests until the level's run passes on the base merged in |
| `GATE-BASE` | not this bolt's to fix: draft a fix bolt for the base (aidlc fix); this merge waits for it |
| `GATE-REVIEW` | run the reviewer on the current diff and card: aidlc review record |
| `GATE-CARD` | render the card (aidlc card) and review against it |
| `GATE-SPECIALIST` | run the reviewer with that focus on the current diff |
| `GATE-OKF` | fix the doc, then run aidlc check |
| `GATE-SECURITY` | fix what the security check reports |
| `GATE-DEPENDENCY` | bump each flagged dependency to the newest stable release that fixes it, looked up from its registry, and report the source |
| `ARCH-BOUNDARY` | remove the dependency, or the owner approves an exception decision; a bolt that adds a boundary lists the edges the base already has in its except decision, or its own merge fails |
| `ARCH-CHECK` | fix what the architecture check reports |
| `ARCH-KIND` | depend only on what the kind table allows (docs: Architecture model): a domain on foundation kits and other domains' client or events, never the core on an extension or product code on delivery; move the code, or the owner approves the edge as an exception |
| `ARCH-LAYER` | point layers inward: interface to application and model, application to model, infrastructure to model; model depends only on foundation kits |
| `ARCH-REACH` | split the domain's client from its internals so a runtime that only calls it links only the client (its surfaces), or host the domain in the runtime |
| `ARCH-API` | call the module through its public paths, move what is needed into them, or the owner approves the edge in the architecture.api.except decision with a fix bolt |
| `ARCH-CYCLE` | break the circle: move the shared part into its own module, or let one side publish an event the other reads; or the owner approves a module edge in the architecture.acyclic.except decision with a fix bolt |
| `ARCH-DATA` | go through the owning module (interface, event or shared service), give the data one owner, or the owner approves the edge in the architecture.data.except decision with a fix bolt |
| `GATE-SHARED` | revert the change; merge writes indexes, logs and shared files |
| `GATE-CONFLICT` | merge the base into the bolt branch, resolve, and report again |
| `CI-DEPENDENCY` | plan a fix bolt (aidlc fix) that bumps each flagged dependency to the newest stable release, looked up from its registry |
| `CI-MERGE` | merge bolts only with aidlc merge |
| `CI-COMMIT` | commit code only through bolts; direct commits may touch only docs and workflow files |
| `PUSH-COMMIT` | move the change into a bolt; direct commits may touch only docs and workflow files |
| `GATE-SECRET` | remove the secret from the bolt branch; read it from the environment |
| `GATE-IDENTITY` | use the runtime's workload identity: mTLS or a token bound to it, a database role reached with short-lived certificates or tokens, federated credentials outside the cluster; a throwaway password belongs in a test path |
| `GATE-NAME` | rename it to match the rule's pattern; if the rule is wrong, the owner changes its decision and the profile first |
| `TERM-SYNONYM` | use the glossary's term; if the domain's language changed, change its domain doc's glossary first (docs: Naming) |
| `PROOF-AC` | make the reverted tree compile (keep the interfaces, revert the behaviour), or report a mutation per AC (docs: Construction by proof) |
| `REVIEW-SECURITY` | the owner disposes of each finding: aidlc dispose <B-n> F-<k> fixed\|accepted "<reason>" [--until <date>] (docs: Construction by proof) |
| `INCR-DONE` | release increment 1 and pass its smoke on the target first (docs: Construction by proof) |
| `SLICE-IMPORT` | move what both slices need into the domain's model, an event or a shared domain service; a slice never imports another (docs: Vertical slices checked) |
| `SLICE-ENTRY` | enter the slice from its domain's interface layer or from the runtime that hosts it, and only from there (docs: Vertical slices checked) |
| `SLICE-PLACE` | put each file of a domain in one of its layers, each file of its application layer in one slice folder, and leave no folder empty (docs: Vertical slices checked) |
| `SLICE-SURFACE` | list each slice folder under the domain doc's # Surface as - Command <slice>: <the use case it serves> [I-<n>:US<g>.<s>], or - Query, and no other (docs: Vertical slices checked) |
| `SLICE-STORY` | cite on each slice's surface line the stories it serves, as [I-<n>:US<g>.<s>], so every story of a unit of work that changes the domain has a slice (docs: Vertical slices checked) |
| `SLICE-TEST` | give the slice a test in its folder, or a test that imports it (docs: Vertical slices checked) |
| `SLICE-NAME` | name the slice as aidlc name slice composes it, from a verb of the registry and the domain's noun (docs: Vertical slices checked) |
| `SLICE-ROUTE` | give each slice its operation, with the operation id aidlc name operation-id composes from the same domain and verb, once in the contracts (docs: Vertical slices checked) |
| `SLICE-DELIVER` | deliver a new slice whole: its route in the domain's interface layer or a runtime, its test and its line under the domain doc's # Surface, in the same bolt (docs: Vertical slices checked) |
