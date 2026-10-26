---
type: Design
title: Slices
description: An intent's vertical slices - the plan rules PLAN-SLICE checks, the card's Spec line computed from the same facts, and how each merged slice ships to dev before the next one builds.
status: stable
generated: { by: claude-code/claude-fable-5-1, at: 2026-10-26T11:30:00Z }
---

# Plan rules
An intent lists its vertical slices under `# Slices`, one line each, naming the units that build it once they are cut (`- Owners and the gate: U-31, U-32`). While a line names no unit the intent is not done, even when every unit it has is merged: `next` asks to cut that slice's units, or, for a slice built before the line named its units, to name the merged units that built it (first migration: I-1 came back ahead of I-5). So a slice planned "for later" cannot be forgotten when the first slices ship nothing and the intent counts as released (first migration: I-3 closed after 2 of its 4 slices). An intent without the section counts its units only.

Each slice is vertical, checked by `PLAN-SLICE` before approval and at every `check` ([Plan lint](plan-lint.md)), for an intent whose live units reach the product:
- An intent with more live units than `plan.sliceUnits` has the section (a smaller one is one slice), and with the section every live unit is named on a slice line.
- Each slice line naming units names one with an AC at the top level: a slice without its own end-to-end test is a layer, not a slice.
- A slice names at most `plan.sliceUnits` units (default 3): a fat slice is a layer cake in disguise.
- No unit waits on a unit of a later slice, so the first slice is the walking skeleton and each slice builds on the ones before it.
- A unit on a slice without an AC at the top level is there because a vertical unit of the slice depends on it, directly or through others; else it is a layer riding along. An intent without slice lines is one slice.
- No unit of an intent waits on a fix unit not yet merged. Fix units build in the free slots beside the slices; work a slice truly needs moves into that slice.

Why: on both migrations the plan drifted into chains of layer and hygiene units ahead of the product. The second project's only intent cut its units as layers (foundation, API kit, sign-in, tenancy) with the walking skeleton behind them, and the first project's portal and identity slices waited behind dependency and renaming fix units (owner, 2026-10-25: prevent drifting from vertical end-to-end slices).

# Vertical and horizontal specs
- **Vertical:** the intent is the spec of one capability, end to end: goal, why, risks and its slices, each a step of the user journey through every layer; its units carry the ACs, the domain and logical design. Each rule or limit says why, so a later change knows what it may move.
- **Horizontal:** a layer or standards doc (API conventions, schema, UI kit, platform) in the project's design or architecture docs, linked from a unit's `# Interfaces` rather than copied.
- Inception writes vertical specs only. A horizontal doc is extracted when a second slice needs the same pattern, by that slice's unit; it is never its own unit ahead of the slices, which `PLAN-SLICE` reports as a layer.

Why: the AI-DLC guidance on spec architecture the owner brought (a talk, 2026-05) starts vertical, extracts horizontal specs as reuse appears, and keeps the why beside each rule; the intent template already held the vertical spec, so the plugin adds the risks and the why per rule instead of a second doc per journey.

# The Spec line
The card's `Spec:` line and `PLAN-SLICE` read one function, `sliceRole`, so the label can never contradict the check (owner, 2026-10-26: a label from no evaluation would). It reads two facts, the slice line naming the unit and the unit's ACs at the top level (the last level with a `run`), and names its evidence:
- `vertical: builds I-<n> slice <k> (<name>), proven end to end by AC-<k> (<level>)`: the top-level ACs; the merge gate proves them by failing their tests with the unit's code reverted.
- `horizontal: supports I-<n> slice <k> (<name>), needed by U-<v>`: the slice's vertical units that depend on it, directly or through others. None is a `PLAN-SLICE` error: a layer riding along.
- `unsliced`: no slice line of the intent names the unit, a `PLAN-SLICE` error too.
- `horizontal: a fix unit of no intent`.
An intent without slice lines is one slice. What the function cannot read is prose: a unit whose text describes a layer still reads `vertical` when it owns a top-level AC, so the proof is the test, not the words.

# Shipping a slice
An intent with `# Slices` ships each slice when its units are merged, not only at the end: while the newest merged slice is not in the last passing release (its merges not ancestors of that release's base commit), the intent runs the same steps (deploy check, the owner's `release I-<n>`, smoke) while its next slices build. The intent is released only by a release after its last merge. With `ci.wait`, the release waits for a pushed base whose CI passed ([CI on the base](base-ci.md)). Only the intent's own units count: a slice line citing another intent's merged unit ships nothing of this intent (a draft intent continuing an older one was offered a release, first migration 2026-10-26). Why: each slice's end-to-end test runs on CI, but dev saw nothing of an 8-slice intent until the last one merged (second project, 2026-10-25). While builders run, `next` names a due release step instead of only waiting, so the owner's release does not wait for an idle loop.
- `readState` marks such an intent `sliceDue`; `deploy` and `release` accept it, and `next` names a due release step while builders run instead of waiting.
- With `ci.wait` the release waits for a pushed base whose CI passed ([CI on the base](base-ci.md)); `deploy.run` must therefore be safe to run twice on one base ([Deployment and operation](operations.md#details)).
