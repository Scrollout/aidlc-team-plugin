---
type: Design
title: Steering
description: How the plugin corrects the agent during work, keeps it moving, and improves its rules over time without growing.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** Three loops. In the moment, every block names the fix. Across a turn, a Stop hook keeps the lead on `next`. Across intents, a retro turns repeated failures into one proposed rule change for the owner.

## 1. In the moment: every block names the fix
- Hooks and the gate never just say no: each finding is `CODE message → do <fix>`, e.g. `SCOPE-OUT internal/x.go is outside U-3 → stop and report; the lead widens the scope`.
- The agent fixes and retries in the same turn. The docs hook and reviewer `fix` verdicts work the same way.
- Repeated identical denials (same code, same target, 3 times in a turn) switch to `escalate`: stop and tell the owner, instead of looping.

## 2. Across a turn: stay on the grid
- **SessionStart** injects `aidlc status` on startup, resume and compaction, so a fresh or compacted context re-reads the state instead of remembering it.
- **Stop hook (`steer`):** when the lead tries to end its turn, the hook runs `aidlc next`. If the next action is autonomous (build, review, fix, merge) and no human gate is pending, it blocks the stop with that action. It lets the stop through when a human gate is pending, when the owner asked a question, or on the second consecutive block (`stop_hook_active`), so it can never loop.
- The lead never decides what comes next on its own; drift back to free-form work is corrected at the next `next`.

## 3. Across intents: the retro
- Runtime counters in `.git/aidlc/stats.json` (bounded: one counter per finding code and per escalation reason, reset by the retro).
- `aidlc retro` at the end of an intent lists codes that fired 3+ times and every escalation and owner intervention, and proposes at most three concrete changes: a profile glob, a project rule in `.aidlc/rules/`, a template tweak, or a new check.
- The owner accepts or rejects each. Accepted changes are ordinary commits to the project; the plugin never edits itself or its rules unasked.
- Personal preferences the owner states repeatedly go to `.aidlc/local/` (untracked). A preference that conflicts with a `deny` from a higher layer is refused, with the rule it conflicts with.
- A proposal that belongs in the plugin (not the project) becomes an issue draft for the plugin repo, which the owner files.

## Why
The AI-DLC video series stresses that skills can be skipped and context drifts, so deterministic hooks and fresh-context checks must catch what guidance misses, and that a harness should learn from repeated corrections. Bounded counters and owner-approved proposals give that learning without a ledger or self-growing prose.
