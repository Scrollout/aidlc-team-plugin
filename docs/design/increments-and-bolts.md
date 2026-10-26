---
type: Design
title: Increments and bolts
description: Draft - an intent ships in increments (increment 1 the walking skeleton on its target), each built by bolts B-<n> that the CLI allocates, with legacy units read as aliases only; replaces the intent's Slices section, the Spec labels and the slice cap.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:40:00Z }
---

# Why
The intent's `# Slices` mixed delivery steps with code slices. The card's `Spec:` label, read from them, called a unit vertical or horizontal by its tests, not by what it builds. In AI-DLC a Unit is a bounded context and a Bolt is the build cycle. The plugin's "unit" was a Bolt by another name ([Canonical model](canonical-model.md)).

# Increments
- An intent lists `# Increments`, one line each: `- I-<n>.<k> <name>: <outcome>, proven by <top-level AC>`.
- **Increment 1 is the walking skeleton.** It holds a target-level AC and the delivery module, so it is done only once it runs where it will run (`INCR-SKELETON`, `INCR-DONE`, M19).
- Bolts are cut for the current increment only, just in time.
- An increment ships when its bolts are merged and its smoke passes. The next increment's bolts may build meanwhile, but none merges past an undone increment 1.
- `INTENT-SIZE` (M18): at most 5 increments, each with its own success measure.

# Bolts
- **IDs.** `B-<n>`, allocated by `aidlc new bolt "<title>"` with a generated slug ([Bundle](bundle.md)), never typed.
- **Names.** Branch `bolt/B-<n>`; test tags `B-<n>/AC-<k>`, or `R-<n>/AC-<k>` for a requirement's ACs.
- **Front matter.** `intent`, `increment`, `binding` (`domain: <code>`, or `module: <id>` plus `neededBy: B-<v>`), `scope`, `acs`, `fix`.
- **Binding** (M19): one domain, or one horizontal module needed by a domain bolt of the same increment. Several domains only in increment 1.
- **Fix bolts.** `fix: true`, exactly one AC (a regression test failing before the fix), no decision touched. They take free slots beside the increments and never carry feature or design work.

# Removed
- the intent's `# Slices` and its plan rules;
- `sliceRole` and the card's `Spec:` line (`vertical`, `horizontal`, `unsliced`, `fix`);
- `plan.sliceUnits`;
- the slice-shipping state;
- `slices.md`.

Each goes in the bolt that brings in its replacement, with its tests.

# Legacy
- `U-<n>` and `units/` are read as aliases of bolts: cards, gates and history keep working.
- A new doc under `units/` is refused.
- Old test tags `U-<n>/AC-<k>` still count for their bolt.
- The aliases expire one milestone after the last pilot migrates (M21).

Bolts: [M15](../roadmap/m15.md) B152, B153.
