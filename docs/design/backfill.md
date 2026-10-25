---
type: Design
title: Proof for back-fill tests
description: Draft - how a tests-only unit, one that adds characterization tests for code built before a migration, proves its tests can fail - the builder lists one mutation per AC and the gate applies each.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T09:00:00Z }
---

# Why
A project that migrates brings in code with no units ([M7](../roadmap/m7.md)); the owner's way in is a back-fill, by risk: units that add tests for what the code does today. Proof-revert ([Merge mechanics](gate.md)) reverts a unit's code and expects its tests to fail, but a back-fill unit has no code to revert, so the gate prints `proof skipped: no change outside the test paths` and nothing shows that its tests bite.

# Shape
1. **Mutations:** the builder's report for a unit with no change outside the test paths lists one mutation per AC: `{ "ac": "U-<n>/AC-<k>", "path": "<file>", "find": "<text>", "replace": "<text>", "breaks": "<behaviour>" }`, breaking the AC's main behaviour, not only an edge; `breaks` names it ([M8](../roadmap/m8.md)). `path` is code the test covers, outside the test paths and the unit's diff; `find` occurs exactly once in it. `aidlc report` refuses a `done` report that lacks one for an AC or whose `find` does not match once.
2. **Review:** the card lists the mutations. The reviewer sends a unit back when a mutation does not break the behaviour its AC names, or breaks only an edge of it.
3. **Gate:** in the trial tree, the gate applies each mutation alone, runs its AC's level and restores the file. A level that still passes, or skips, refuses the merge as `GATE-PROOF`, naming the AC; so does an AC without a mutation, or one whose `find` no longer matches. The `Proof:` trailer names `mutation` and the levels, and the merge prints the level each mutation failed.
4. **Wiring:** a unit that changes code may report mutations too, and the gate then proves it by them instead of by revert. It is for a change whose revert cannot fail its tests, such as one that wires a new test into the level's run (the revert unwires it) or one in `.aidlc/`, which the revert keeps (first migration: a profile unit whose test runs through a new make target). Its mutations may edit its own diff; one per AC is still required, and `report` says so in those words. A unit whose AC is a profile setting mutates `.aidlc/profile.json` itself, even in its own diff: the profile is not reverted, since that would also revert the levels and rules the gate runs with, and a mutation of the vendored CLI proves nothing about the project (first migration). A report's mutations are the reviewer's to judge, so a verdict older than the report counts neither for `next` nor for the gate.
5. **No release:** an intent whose units' scopes all lie inside the levels' test paths ships no code: plan lint asks it for no runbook, and once merged it is released, with no deploy check or release (owner's choice, after the [M7 back-fill pilot](../pilot/m7-report.md)).

# Choices
The owner's, 2026-10-24: the builder lists the mutations and the gate applies them; the reviewer judges them. Not chosen: mutations from the reviewer, or a profile mutation tool, which would be language-specific.

Units: [M7](../roadmap/m7.md).
