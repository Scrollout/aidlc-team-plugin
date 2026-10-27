---
type: Design
title: Increments and bolts
description: An intent ships in increments (increment 1 the walking skeleton on its target), each built by bolts B-<n> that the CLI allocates, with legacy units read as aliases only; replaces the intent's Slices section, the Spec labels and the slice cap.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Why
The intent's `# Slices` mixed delivery steps with code slices. The card's `Spec:` label, read from them, called a unit vertical or horizontal by its tests, not by what it builds. In AI-DLC a Unit is a bounded context and a Bolt is the build cycle. The plugin's "unit" was a Bolt by another name ([Canonical model](canonical-model.md)).

# Increments
- An intent lists `# Increments`, one line each: `- I-<n>.<k> <name>: <outcome>, proven by <top-level AC>`.
- **Increment 1 is the walking skeleton.** It holds a target-level AC and the delivery module, so it is done only once it runs where it will run (`INCR-SKELETON`, `INCR-DONE`, [M19](construction.md)).
- Bolts are cut for the current increment only, just in time.
- An increment line naming no bolt is an increment still to cut: the intent is not done, and `next` asks to cut it.

# Plan rules
`PLAN-INCREMENT` ([Plan lint](plan-lint.md)), in force for an intent whose live bolts reach the product:
- **IDs.** Each line under `# Increments` opens with its ID, `I-<n>.1`, `I-<n>.2`… in order. A v1 intent's `# Slices` lines carry none and are read as increments.
- **Proof.** Every live bolt is on a line, and each line names a bolt with a top-level AC. An intent without the section is one increment, and runs end to end once with a top-level AC (or `endToEnd: "<why>"`, which v1's `slice:` also gives, outside every module and one-way door).
- **Order.** No bolt waits on a bolt of a later increment, or on a fix bolt not yet merged.
- **Needed.** A bolt with no top-level AC sits on an increment only if a bolt of it with one depends on it.

# Shipping an increment
An intent ships each increment when its bolts merge, not only at the end. While the newest merged increment is not in the last passing release, the intent runs the release steps (deploy check, the owner's `release I-<n>`, smoke) while its next increments build. `readState` marks it `incrementDue`, `deploy` and `release` accept it, and `next` names a due release step while builders run. The intent is released only by a release after its last merge. Only the intent's own bolts count: a line citing another intent's merged bolt ships nothing of this one. With `ci.wait` the release waits for a pushed base whose CI passed ([CI on the base](base-ci.md)), so `deploy.run` must be safe to run twice on one base ([Deployment and operation](operations.md#details)).
- `INTENT-SIZE` (M18): at most 5 increments, each with its own success measure.

# Bolts
- **IDs.** `B-<n>`, allocated by `aidlc new bolt "<title>"`, never typed: the next number over every unit and bolt, the file named from the title (no apostrophes, at most 48 characters, cut at a word). `aidlc fix` writes a fix bolt the same way in a v2 project.
- **Names.** Branch `bolt/B-<n>`; test tags `B-<n>/AC-<k>`, or `R-<n>/AC-<k>` for a requirement's ACs.
- **Front matter.** `intent`, `increment`, `modules` (its binding), `neededBy`, `scope`, `acs`.
- **Binding** (M19): one domain, or one horizontal module needed by a domain bolt of the same increment. Several domains only in increment 1 ([Construction by proof](construction.md)).
- **Fix bolts.** No intent, exactly one AC (a regression test failing before the fix), no decision touched. They take free slots beside the increments and never carry feature or design work.

# Removed
- the intent's `# Slices` and its plan rules;
- `sliceRole` and the card's `Spec:` line (`vertical`, `horizontal`, `unsliced`, `fix`);
- `plan.sliceUnits`;
- the slice-shipping state;
- `slices.md`.

B152 removed the section, the `Spec:` line, `plan.sliceUnits` and `slices.md`, keeping v1 intents' `# Slices` as above. Each other item goes in the bolt that brings in its replacement, with its tests.

# Legacy
- `U-<n>` and `units/` are read as aliases of bolts: cards, gates and history keep working.
- In a v2 project (its profile has `system`), a doc under `units/` that no v1 plan approved is `PLAN-BOLT`.
- Old test tags `U-<n>/AC-<k>` still count for their bolt.
- The aliases expire one milestone after the last pilot migrates (M21).

Bolts: [M15](../roadmap/m15.md) B152, B153; [M19](../roadmap/m19.md) B182 (binding), B186 (`INCR-SKELETON`, `INCR-DONE`), B188 (`FIX-SHAPE`).
