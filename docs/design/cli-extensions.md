---
type: Design
title: Extension commands
description: The aidlc commands the CLI's extensions add - the stack packs' graph and scaffold, the board's sync, operations' deploy, release, rollback and retro, intake and models - with what each does and who runs it.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T21:00:00Z }
---

# Commands
Each comes with its extension ([Library and extensions](library.md#extensions)); the core's are in [CLI](cli.md).

| Command | Does | Run by |
|---|---|---|
| `retro <intent>` | lists the codes that fired 3+ times, the intent's escalations, the owner's interventions and failed deploy steps, proposes at most three changes, and resets the counters ([Steering](steering.md#3-across-intents-the-retro)) | lead, owner |
| `models [doc <name>\|apply <name>\|gaps]` | lists the models the project can apply; `doc` writes a project model's Model doc for the owner to approve; `apply` takes a model on; `gaps` lists what the modules miss of it ([Models](models.md#applying-a-model)) | lead |
| `intake "<prose>"\|--file <path>\|Q-<n> [--<factor> <band>:<ids>]…` | keeps the owner's request word for word as `requests/Q-<n>` and proposes pathway, stack and lane; with `Q-<n>`, records the lead's bands ([Intake](intake.md)) | lead |
| `graph` | the dependency graph the stack pack reads from source, imports and data ([Stack packs](stack-packs.md)) | gate, lead |
| `scaffold <kind> <name> [--domain d]` | a kind's templates from the stack pack, named from the registry; never overwrites | lead, builder |
| `sync` | projects intents and bolts onto GitHub issues and a Project ([Board](board.md)) | lead, merge |
| `deploy check <intent>` | runs `deploy.check` on the base and records it ([Deployment and operation](operations.md)) | lead |
| `release <intent>` | runs `deploy.run` and `release` on the base, then `deploy.smoke` when they passed, and records each | owner (prompt or the words `release I-<n>`) |
| `rollback <intent>` | runs `deploy.rollback` and records it; without one it records the owner's rollback by hand | owner (prompt or the words `rollback I-<n>`) |
