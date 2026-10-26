---
type: Design
title: Steering
description: How the plugin corrects the agent during work, keeps it moving, and improves its rules over time without growing.
status: draft
sources:
  - id: aws-learnings
    resource: https://github.com/awslabs/aidlc-workflows/blob/main/core/aidlc-common/protocols/stage-protocol-learnings.md
    title: Reference AI-DLC learnings protocol
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T22:20:00Z }
---

# 1. In the moment: every block names the fix
- Hooks and the gate never just say no: each finding is `CODE message → do <fix>`, e.g. `SCOPE-OUT internal/x.go is outside U-3 → stop and report; the lead widens the scope`.
- The agent fixes and retries in the same turn. The docs hook and reviewer `fix` verdicts work the same way.
- Repeated identical denials (same code, same target, 3 times in a turn) switch to `escalate`: stop and tell the owner, instead of looping.

# 2. Across a turn: stay on the grid
- **SessionStart** injects `aidlc status` on startup, resume, clear, compaction and fork, so a fresh or compacted context re-reads the state instead of remembering it.
- **Stop hook (`steer`):** when the lead tries to end its turn, the hook runs `aidlc next`. If the next action is the lead's own (build, review, fix round, merge, research, restart, drafting units, a delegated approval, the deploy check, a fix unit after a failed check or a rolled-back smoke) and no human gate is pending, it returns `decision: "block"` with that action as the `reason`. It lets the stop through when a human gate is pending, while builders or a researcher run, when the owner was asked a question, at the stopping point set with `aidlc mode --stop`, or when `stop_hook_active` is true (already continuing because of a stop hook), so it can never loop. Claude Code also caps consecutive stop-hook continuations at 8, per the hooks reference.
- The lead never decides what comes next on its own; drift back to free-form work is corrected at the next `next`.

# 3. Across intents: the retro
- Runtime counters in `.git/aidlc/stats.json`, bounded: one counter per finding code (hook denials, gate refusals), one per escalation reason (`review`, `stopped`, `denials`), and bounded lists (`retro.keep`): the owner commands that ran, those the CLI refused, each stop report (a restart replaces the one on disk), each send-back for an untagged AC, each command auto mode refused, and each failed deploy step. The retro resets them.
- `aidlc retro I-<n>` at the end of an intent lists the codes that fired 3+ times since the last retro, each escalation of the intent's units (review verdicts on disk, stop reports and send-backs from the counters), every owner approval of the intent's docs and the decisions they cite, from their `human:` stamps (each owner's latest per doc), however it was run, the other owner commands that ran, those the CLI refused, each command auto mode refused, and each failed deploy check, release, smoke and rollback with the fix units started `--after` the intent ([Deployment and operation](operations.md)). It proposes at most three changes, one per most frequent code or escalation reason, from the `retro.proposals` map: a profile glob, a project rule in `.aidlc/rules/`, a template tweak, or a new check.
- As in the reference workflows' learnings ritual, a deterministic tool surfaces and the person decides: framework files never change, and a kept learning becomes a project rule or a new check.[^aws-learnings] The owner accepts or rejects each. Accepted changes are ordinary commits to the project; the plugin never edits itself or its rules unasked.
- Personal preferences the owner states repeatedly go to `.aidlc/local/` (untracked). A preference that conflicts with a `deny` from a higher layer is refused, with the rule it conflicts with.
- A proposal that belongs in the plugin (not the project) becomes an issue draft for the plugin repo, which the owner files.

# Why
The AI-DLC video series stresses that skills can be skipped and context drifts, so deterministic hooks and fresh-context checks must catch what guidance misses, and that a harness should learn from repeated corrections. Bounded counters and owner-approved proposals give that learning without a ledger or self-growing prose.

[^aws-learnings]: Reference AI-DLC learnings protocol
