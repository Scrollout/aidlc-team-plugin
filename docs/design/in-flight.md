---
type: Design
title: Agents in flight
description: How the CLI knows a builder, reviewer or researcher is still running - the marks the hooks touch and how long one stays fresh.
status: stable
sources:
  - id: cc-env
    resource: https://code.claude.com/docs/en/env-vars
    title: Claude Code environment variables
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T21:00:00Z }
---

# Marks
- A builder: `.git/aidlc/heartbeats/B-<n>`. The `model` hook touches it at launch; the heartbeat hook touches it on each tool call in the bolt's `bolt/*` worktree.
- A builder's launch: `.git/aidlc/launches/B-<n>`, touched by the `model` hook only. A stop report, or a `fix` verdict, is taken over by a builder launched after it, never by the last builder's own calls, which keep its heartbeat fresh for minutes after its report. A fresh heartbeat newer than the launch is an earlier builder still calling on the branch, so `start` leaves its worktree alone.
- A builder launched after the bolt's last verdict and its last report, with a fresh heartbeat, is a fix round at work: the bolt reads as building even when a focus kept its pass, so no review is asked for a head it still moves.
- A reviewer: `.git/aidlc/reviewing/B-<n>`, one line per reviewer in flight. The `model` hook adds a line at launch (starting over when the file went quiet), the reviewers' calls keep it fresh, and `review record` removes one line, the file with the last, so a focus that records first leaves the others waited for, and no review is offered again while it runs. A reviewer's calls never touch a builder's heartbeat, so reading a builder's worktree keeps no builder alive.
- A researcher: the `researching` mark of the doc its brief names, kept the same way.

# Fresh for 12 minutes
- A mark is fresh for `state.heartbeatMs`, 12 minutes. While it is, `next` waits for that agent and starts no second one (a held bolt's quiet builder is not waited for); a stale builder mark with no report means the builder is restarted from its branch, and a stale reviewer mark means the review runs again.
- The heartbeat hook runs as each tool call starts (PreToolUse) and as it ends (PostToolUse). A foreground Bash call runs at most 10 minutes unless the user raises `BASH_MAX_TIMEOUT_MS`,[^cc-env] so a live agent's mark is never older than that, plus the time it thinks between calls.
- The heartbeat hook never blocks a call: it sets no `onFailure`, and without the pinned CLI it lets the call through.
- Why: a reviewer can run the card's test runs as one call of several minutes; with a 2-minute window and marks touched only after a call, the steer hook would ask for a second review of a bolt already in review. A touch at the start and end of each call, with a 12-minute window, avoids that; a crashed agent is noticed after 12 minutes instead of 2.

[^cc-env]: Claude Code environment variables
