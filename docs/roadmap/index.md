# Plan

* [Later](later.md) - Ideas kept for after the first real migration, none planned - org rule packs, domain row templates, a CI evaluator agent, other agent hosts, staged checks, reserve and clean.
* [M1 Core loop](m1.md) - The first usable plugin - CLI, grid state, cards, merge gate, six hooks, builder and reviewer - piloted on a copy of a real project.
* [M10 Draft](m10.md) - Draft - a fully vertical build - the Domain and Logical rows checked before code, from the first migration.
* [M2 Hardening and retro](m2.md) - Close what the M1 pilot left to a person, run on Windows, and add the retro that shows whether the loop improves.
* [M3 Conventions and proof](m3.md) - Builders follow each project's own rules, and a test must fail without its change.
* [M4 Review rounds and owner steps](m4.md) - Card fixes, owner badges, send-back reasons, bounded and targeted review rounds, decisions for one-way doors and fewer owner prompts, built from the M3 and M4 pilots.
* [M5 Plan checks and a fresh lead](m5.md) - Generated files in a scope, vertical slices, skipped tests that do not pass, a fresh lead per intent with the clear recorded, refused owner commands and worktrees removed after a merge, built from the M4 pilots on 0.47.0 to 0.53.1.
* [M6 Deployment and operation](m6.md) - The grid's Deployment and Operation rows - deploy check, release, smoke, rollback, runbook and feedback - run from the project profile, built and piloted on 0.54.0 to 0.58.3.
* [M7 Build method and back-fill](m7.md) - The build method from day one (level runs at init, a constitution, upgrade adds what is missing), proof for back-fill tests by mutation, and the M6 and M7 pilot findings, built on 0.59.0 to 0.67.0.
* [M8 Alignment and cleanup](m8.md) - Mutations that break an AC's main behaviour, then a full alignment and cleanup before the first real migration - docs that match the code, dead code out, values into cli.json, steadier tests, evals and a security pass, built on 0.68.0 to 0.74.0.
* [M9 Draft](m9.md) - Draft - CI on the base before the first real migration - push before new builders, wait for the base's CI, and a red base comes first in next.
