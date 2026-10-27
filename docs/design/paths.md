---
type: Design
title: Everyday paths
description: Fixes without an intent, changes mid-flight, shared files, pushing and base health, cleanup, adopting an existing project, and removing the plugin.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Fixes without an intent
- `aidlc fix "<title>"|--from-issue <n> --scope <glob>… [--requirement R-<n>…] [--after <intent>]` creates a one-bolt plan, the next `bolts/B-<n>-<slug>.md`: no intent, one AC at the first level for a regression test that fails before the fix. `--from-issue` titles it like the issue and links it ([Board](board.md)); `--after` names the release it fixes ([Deployment and operation](operations.md)). It prints the plan lint findings of the bolt it wrote. A fix outside the quick lane needs the owner's approval, like any bolt.
- Quick lane: no approval. Standard lane: the owner approves the single bolt (one line). Full lane: the owner approves the single bolt too, and the full lane's reviews run.
- Production incidents enter here, with the incident linked from the bolt.

# Change mid-flight
- Requirements change → the lead edits the bolt doc → it goes `stale` → the builder's card no longer matches and the gate refuses its merge.
- `status: dropped` retires a bolt; to split one, drop it and draft the new bolts. Both are plan edits, so they need approval.
- A builder in flight on a stale card is stopped and restarted from the new card, never patched.

# Shared files (no catch-up merges)
- Builders never edit `index.md`, `log.md` or files listed in `profile.shared` (lockfiles, generated code, `go.sum`).
- `aidlc merge` updates the bundle index and log from the bolt doc, and runs `profile.regen` for shared files on the merged result.
- This removes the hotspots that force repeated catch-up merges.

# Pushing and base health
- The lead commits on the base only the bundle, `.aidlc/**` and the files `init` writes; the guard denies a base commit with other files.
- `aidlc push` lists the base commits the remote lacks; on a base never pushed, those after the commit that added `.aidlc/profile.json`, since history before the plugin follows no gate. Each must be a merge with the `Unit`, `Card` and `Review` trailers whose files are in the bolt's scope or merge-written (`PUSH-COMMIT` otherwise, also for a `Bolt:` trailer naming no bolt in the plan), or touch only allowed direct paths: the bundle, `.aidlc/**`, and the files `init` writes. Then it pushes the base. A raw push of the base is denied. Tags and releases always ask the owner.

# Cleanup
`aidlc merge` removes the bolt's worktree and branch after a successful merge. When a builder still holds a merged bolt's worktree, `next` names the `git worktree remove` and `git branch -D` to run. A `clean` command is [Later](../roadmap/later.md).

# Adopting an existing project
- `init --adopt` detects an existing bundle (the shallowest `index.md` with `okf_version`) and keeps its layout: it sets `docs.bundle` to that folder instead of moving files.
- Existing docs are validated with spec rules as errors and house rules as warnings, and only counted in the report, so adoption never starts with hundreds of errors.
- It lists leftovers of other workflow tools (old state dirs, tool-named trailers or docs) as a report; it never deletes them.
- It records the adoption commit as `profile.adopted`; `check --ci` judges only merges after it, so history made before adoption never fails CI.
- Approvals made before adoption carry no `verified_hash`, so they read as `stale`; the owner re-approves them in one `aidlc approve` command.
- The migration itself is an ordinary intent: adopt, docs, architecture baseline (each current violation becomes a fix bolt or an approved exception), data owners ([Data ownership](data-ownership.md)), module audit against the requirements, cleanup.

# Removing the plugin
Docs are plain OKF, the CLI is vendored, CI runs without the plugin. Uninstalling loses only the hooks, skill and agents; a test proves the project still checks green.
