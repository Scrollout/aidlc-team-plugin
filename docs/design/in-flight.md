---
type: Design
title: Agents in flight
description: How the CLI knows a builder, reviewer or researcher is still running - the marks the hooks touch and how long one stays fresh.
status: draft
sources:
  - id: cc-env
    resource: https://code.claude.com/docs/en/env-vars
    title: Claude Code environment variables
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T20:10:00Z }
---

# Marks
- A builder: `.git/aidlc/heartbeats/U-<n>`. The model hook touches it at launch; the heartbeat hook touches it on each tool call in the unit's `unit/*` worktree.
- A builder's launch: `.git/aidlc/launches/U-<n>`, touched by the model hook only. A stop report is taken over by a builder launched after it, never by the stopped builder's own last calls, which touch its heartbeat after the report (third M4 pilot).
- A reviewer: `.git/aidlc/reviewing/U-<n>`. The model hook creates it at launch, the reviewer's calls keep it fresh, and `review record` removes it. A reviewer's calls never touch a builder's heartbeat, so reading a builder's worktree keeps no builder alive.
- A researcher: the `researching` mark of the doc its brief names, kept the same way.

# Fresh for 12 minutes
- A mark is fresh for `state.heartbeatMs`, 12 minutes. While it is, `next` waits for that agent and starts no second one (a held unit's quiet builder is not waited for); a stale builder mark with no report means the builder is restarted from its branch, and a stale reviewer mark means the review runs again.
- The heartbeat hook runs as each tool call starts (PreToolUse) and as it ends (PostToolUse). A foreground Bash call runs at most 10 minutes unless the user raises `BASH_MAX_TIMEOUT_MS`,[^cc-env] so a live agent's mark is never older than that, plus the time it thinks between calls.
- The heartbeat hook never blocks a call: it sets no `onFailure`, and without the pinned CLI it lets the call through.
- Why: in the second M4 pilot a reviewer ran the card's test runs as one call of several minutes; with a 2-minute window and marks touched only after a call, the steer hook asked for a second review of a unit already in review. The owner chose the start-and-end touch with a 12-minute window (2026-10-23). A crashed agent is now noticed after 12 minutes instead of 2.

[^cc-env]: Claude Code environment variables
