---
type: Design
title: Hook codes
description: Every code the hooks reports, with its fix (a warning is marked); drawn from hooks.codes in cli.json and the extensions' data.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Code | Fix |
|---|---|
| `GUARD-FORCE` | push without force; history on shared branches is never rewritten |
| `GUARD-PUSH` | push the base with aidlc push |
| `GUARD-BASE-DELETE` | the base branch is never deleted |
| `GUARD-NOVERIFY` | commit with hooks; fix what they report |
| `GUARD-BASE-COMMIT` | commit code only in a bolt worktree; on the base commit only docs |
| `GUARD-MERGING` | wait for the merge to end, then commit; a merge that died leaves .git/aidlc/merging, which counts for two hours, or remove it |
| `GUARD-MERGE` | merge bolts with aidlc merge |
| `GUARD-BASE-MOVE` | the base moves only by aidlc merge and aidlc push |
| `GUARD-ALIAS` | run the git command by its own name |
| `GUARD-HOOK` | Claude Code runs the hooks; the agent never runs aidlc hook |
| `SCOPE-STATE` | leave the state to the aidlc command that records it |
| `GUARD-OWNER` | allow the prompt to run it, deny to refuse; in a terminal the owner can also type it with ! |
| `GUARD-RELEASE` | the owner confirms tags and releases |
| `SCOPE-SHARED` | leave indexes, logs and shared files to aidlc merge |
| `GUARD-SCHEDULE` | only the owner approves: they type approve <doc> |
| `SCOPE-APPROVAL` | only the owner approves: they type approve <doc> |
| `SECRET` | keep secrets out of the repo; read them from the environment |
| `MODEL-UNIT` | name the bolt B-<n> in the prompt and start it from its card |
| `MODEL-MISMATCH` | pass the AI model the card names (aidlc card) |
| `GUARD-SUBAGENT` | leave it to the lead: a subagent runs only its role's aidlc commands (hooks.subagentCommands) and returns its result |
