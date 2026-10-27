---
type: Design
title: CI on the base
description: With profile ci.wait, no builder starts on a base whose CI is unknown or red - push first, wait for the base's GitHub Actions runs, and on a red base only a fix bolt builds.
status: stable
sources:
  - id: gh-runs
    resource: https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#list-workflow-runs-for-a-repository
    title: GitHub REST - list workflow runs for a repository
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T12:05:37Z }
---

# Why
`aidlc merge` runs the profile's levels locally, but the project's own CI can still go red on the pushed base (a job the levels skip, another platform, a flaky gate). Unread, it lets builders start on a red base and the next merges pile onto it.

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
With `ci.wait` set:
- **Before new builders** (step 11 of [next](state.md#next)): a base with merges the remote lacks → `aidlc push`; no record for the base head, or a pending one → the builders start and `aidlc ci wait` runs in the background beside them, for speed: a red result then holds their merges, as below. Merges, reviews and fix rounds still go first, so the push carries them.
- **Red base** (a red record, and no merge on the base since; a plan commit such as the fix bolt's doc keeps it red) comes first, after a cut-off merge and a failed release or smoke: without a live fix bolt (a bolt without an intent, not merged), `next` asks for `aidlc fix` from the failing runs, or, for a failure outside the repo (runner, registry, network), a rerun of the failed jobs and `aidlc ci wait` again, which reads the rerun on the same commit: a broken registry cache, say, is no code defect. While red only fix bolts build or merge; builders already running carry on, and other bolts' reviews and fix rounds go on. The merged fix moves the base, so the push and the wait come again.
- **Before a release:** the owner's `release` ships only a pushed base whose CI passed (green, or no run); `next` asks for `aidlc push`, then `aidlc ci wait`, before the release prompt, waits while the base is red, and `release` refuses otherwise: an unpushed base, or one whose CI failed, may have no image to deploy.
- **Red at the gate**, with or without `ci.wait`: a merge whose level fails on the base alone too records the base red (`GATE-BASE`, in `.git/aidlc/base.json`), held the same way until a merge; `next` asks for a fix bolt from the failing level instead of offering the same merge over and over. A bolt refused only for that stays refused until a merge lands, a plan commit not counting, and holds back no fix bolt whose scope overlaps it. Otherwise the refused merge is offered again after every plan commit, a full gate run each time, while the fix never builds.

Bolts: [M9](../roadmap/m9.md).

[^gh-runs]: GitHub REST - list workflow runs for a repository
