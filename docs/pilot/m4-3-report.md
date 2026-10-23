---
type: Report
title: M4 pilot 3 report
description: A short pilot of U36 to U39 on CLI 0.46.0 - a decision for a one-way door, cited requirements in the first approval, long calls, the three bugs fixed in 0.46.1, and the findings for the next batch.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T20:40:00Z }
---

# Run
The scratch copy of the [M4 pilot 2](m4-2-report.md), CLI 0.46.0. Intent I-9 covers one criterion of a draft requirement. Two units ran in parallel:
- U-33 sat at a one-way door: the API contract declares a required header.
- U-34 changed code both inside and outside `focus.security` globs.

The run took about 46 minutes, about 10 of them waiting on the owner. There were no auto-mode refusals and no fix rounds.

# What U36 to U39 changed
- **U39 first approval:** the intent approval named the draft requirement it cites (`approve I-9 R-003`). The plan approval named both units and the decision. The owner approved the whole plan in two prompts.
- **U37 decision:** `PLAN-DECISION` fired on U-33 (`api-specs/**`). The lead drafted decision 0013 with the owner rather than waiving it, since a required header is a promise to clients. The plan approval carried it. `approve` refusing a unit before its decision exists was not tried, since only the owner approves.
- **U36 long calls:** no stale review or restart line appeared while reviewers ran long test commands. Pilot 2 had four.
- **U34 and U38:** not exercised. No unit had a fix round and no reviewer escalated. Their tests cover them.

# Bugs, fixed in 0.46.1
- **A stop read as a restart:** since U36, the stopped builder's own last calls kept its heartbeat fresh after its stop report. `next` showed U-33 as building, and the lead restarted it ahead of `next` twice. A launch mark from the model hook now decides.
- **Bundle-root links:** a `/decisions/…` link did not clear `PLAN-DECISION`, so the lead used a relative link.
- **Delegated re-approval:** `next` and the steer hook offered `approve --auto U-33` three times after its ACs changed, an approval `approve --auto` refuses. None was run, and the owner re-approved.

# Findings for the next batch
- **Scope of generated files:** U-33's builder stopped twice. Its scope named a generated file without its source, and then an untracked copy instead of the tracked output. Each stop cost a re-spec and an owner re-approval. The retro proposes a project rule on naming the folders a unit needs. A plugin-side check could map generated outputs to their sources in the profile.
- **Shared log names:** two units' reviewers wrote test logs with the same file name, and one was overwritten and run again.
- **Worktree left after a merge:** the merge could not remove U-34's builder worktree. `next` named the cleanup, and the lead ran it.

# Steps outside `next`
Two: the lead restarted U-33's builder ahead of `next` because of the stop bug.
