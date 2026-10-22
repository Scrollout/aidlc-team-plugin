---
type: Design
title: Everyday paths
description: Fixes without an intent, changes mid-flight, shared files, pushing and base health, cleanup, adopting an existing project, and removing the plugin.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Fixes without an intent
- `aidlc fix "<title>"` creates a one-unit plan with no intent.
- Quick lane: no approval. Standard lane: the owner approves the single unit (one line). Full lane: needs an intent, like any feature.
- Production incidents enter here, with the incident linked from the unit.

# Change mid-flight
- Requirements change → the lead edits the unit doc → it goes `stale` → the builder's card no longer matches and the gate refuses its merge.
- `status: dropped` retires a unit; `split:` replaces it with new units. Both are plan edits, so they need re-approval.
- A builder in flight on a stale card is stopped and restarted from the new card, never patched.

# Shared files (no catch-up merges)
- Builders never edit `index.md`, `log.md` or files listed in `profile.shared` (lockfiles, generated code, `go.sum`).
- `aidlc merge` updates the bundle index and log from the unit doc, and runs `profile.regen` for shared files on the merged result.
- This removes the hotspots that forced repeated catch-up merges in a pilot project.

# Pushing and base health
- The lead commits on the base only docs inside the bundle; the guard denies a base commit with other files.
- `aidlc push` pushes the base after checking every new commit is a gate merge or a docs commit; raw push of the base is denied. Tags and releases always ask the owner.
- `profile.ci.wait` (optional) polls the base's CI. A red base is the first thing `next` returns: no new builds start until it is fixed.

# Cleanup
`aidlc merge` removes the unit's worktree and branch after a successful merge. An orphan left by a crash is removed with `git worktree remove`; a `clean` command is M2.

# Adopting an existing project
- `init --adopt` detects an existing bundle (index with `okf_version`) and keeps its layout, mapping folders into the profile instead of moving files.
- Existing docs are validated with spec rules as errors and house rules as warnings only, so adoption never starts with hundreds of errors.
- It lists leftovers of other workflow tools (old state dirs, tool-named trailers or docs) as a report; it never deletes them.
- It records the adoption commit as `profile.adopted`; `check --ci` judges only merges after it, so history made under another tool never fails CI.
- Approvals made by another tool carry no `verified_hash`, so they read as `stale`; the owner re-approves them in one `aidlc approve` command.
- The migration itself is an ordinary intent: adopt, docs, architecture baseline (each current violation becomes a fix unit or an approved exception), module audit against the requirements, cleanup.

# Removing the plugin
Docs are plain OKF, the CLI is vendored, CI runs without the plugin. Uninstalling loses only the hooks, skill and agents; a test proves the project still checks green.
