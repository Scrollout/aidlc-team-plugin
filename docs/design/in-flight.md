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
- A builder: `.git/aidlc/heartbeats/U-<n>`. The model hook touches it at launch; the heartbeat hook touches it on each tool call in the unit's `unit/*` worktree.
- A builder's launch: `.git/aidlc/launches/U-<n>`, touched by the model hook only. A stop report, or a `fix` verdict, is taken over by a builder launched after it, never by the last builder's own calls, which keep its heartbeat fresh for minutes after its report (third M4 pilot and the scripted pilot).
- A builder launched after the unit's last verdict and its last report, with a fresh heartbeat, is a fix round at work: the unit reads as building even when a focus kept its pass, so no review is asked for a head it still moves (first migration, 2026-10-26).
- A reviewer: `.git/aidlc/reviewing/U-<n>`, one line per reviewer in flight. The model hook adds a line at launch (starting over when the file went quiet), the reviewers' calls keep it fresh, and `review record` removes one line, the file with the last, so a focus that records first leaves the others waited for (first migration, 2026-10-26: the general review was offered again while it ran). A reviewer's calls never touch a builder's heartbeat, so reading a builder's worktree keeps no builder alive.
- A researcher: the `researching` mark of the doc its brief names, kept the same way.

# Fresh for 12 minutes
- A mark is fresh for `state.heartbeatMs`, 12 minutes. While it is, `next` waits for that agent and starts no second one (a held unit's quiet builder is not waited for); a stale builder mark with no report means the builder is restarted from its branch, and a stale reviewer mark means the review runs again.
- The heartbeat hook runs as each tool call starts (PreToolUse) and as it ends (PostToolUse). A foreground Bash call runs at most 10 minutes unless the user raises `BASH_MAX_TIMEOUT_MS`,[^cc-env] so a live agent's mark is never older than that, plus the time it thinks between calls.
- The heartbeat hook never blocks a call: it sets no `onFailure`, and without the pinned CLI it lets the call through.
- Why: in the second M4 pilot a reviewer ran the card's test runs as one call of several minutes; with a 2-minute window and marks touched only after a call, the steer hook asked for a second review of a unit already in review. The owner chose the start-and-end touch with a 12-minute window (2026-10-23). A crashed agent is now noticed after 12 minutes instead of 2.

[^cc-env]: Claude Code environment variables
