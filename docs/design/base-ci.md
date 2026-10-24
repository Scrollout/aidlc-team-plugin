---
type: Design
title: CI on the base
description: Draft - with profile ci.wait, no builder starts on a base whose CI is unknown or red - push first, wait for the base's GitHub Actions runs, and on a red base only a fix unit builds.
status: draft
sources:
  - id: gh-runs
    resource: https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-repository
    title: GitHub REST - list workflow runs for a repository
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T12:05:37Z }
---

# Why
`aidlc merge` runs the profile's levels locally, but the project's own CI can still go red on the pushed base (a job the levels skip, another platform, a flaky gate). Nothing read it, so builders started on a red base and the next merges piled onto it. Carried in [Later](../roadmap/later.md) since M7; the owner asked for it before the first real migration (2026-10-24).

# Shape
```json
"github": { "repo": "acme/shop" },
"ci": { "wait": 480 }
```
- `ci.wait`: seconds `aidlc ci wait` waits at most; keep it under Claude Code's 10-minute Bash limit. Without it nothing below happens. `ci.interval` (default 15) is the seconds between polls.
- The runs are read from `github.repo` with the owner's `gh` login (`github.gh` names another `gh`), as the [Board](board.md) does: `GET repos/<repo>/actions/runs?head_sha=<sha>`, the `workflow_runs` array.[^gh-runs] GitHub Actions only.

# aidlc ci wait
Refused unless the base is pushed (its head is `origin/<base>`). It polls the runs of the base head until each is `completed`, one ends red, or `ci.wait` passes, and records `.git/aidlc/ci.json`: the sha, the state, each run's id, name, status, conclusion and URL, and when.
- **red:** a run's conclusion is in `ci.red` (`failure`, `cancelled`, `timed_out`, `action_required`, `startup_failure`, `stale`); it exits 1 and names each red run with `gh run view <id> --log-failed`.
- **green:** every run completed, none red.
- **pending:** runs still going when the wait ended; `next` asks for the wait again.
- **none:** no run for the commit when the wait ended (a workflow that skips the paths); counts as green.

# In next
With `ci.wait` set (the owner's choices, 2026-10-24):
- **Before new builders** (step 11 of [next](state.md#next)): a base with merges the remote lacks → `aidlc push`; no record for the base head, or a pending one → `aidlc ci wait`. Merges, reviews and fix rounds still go first, so the push carries them.
- **Red base** (a red record for the base head) comes first, after a cut-off merge and a failed release or smoke: without a live fix unit (a unit without an intent, not merged), `next` asks for `aidlc fix` from the failing runs. While red only fix units build or merge; builders already running carry on, and other units' reviews and fix rounds go on. The merged fix moves the base, so the push and the wait come again.

Units: [M9](../roadmap/m9.md).

[^gh-runs]: GitHub REST - list workflow runs for a repository
