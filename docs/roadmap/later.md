---
type: Plan
title: Later
description: Ideas kept for after the first real migration, none planned - org rule packs, a CI evaluator agent, other agent hosts, staged checks, reserve and clean, and the pilots' open lessons.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T10:00:00Z }
---

# Items
Carried since [M2](m2.md) through [M7](m7.md); each comes back as a unit only when a project needs it.
| Item | When it earns a unit |
|---|---|
| Org rule packs (`profile.org`, a pinned git repo of rules) | a second project wants the same rules |
| CI evaluator agent | CI should judge a change beyond the deterministic checks |
| Other agent hosts | the loop has to run outside Claude Code |
| `check --staged` | checking the whole bundle before each commit gets slow |
| `reserve` and `clean` commands | reserved numbers (migrations) clash in practice |
| `init` and `status` warn when Claude Code is older than `onFailure` needs (v2.1.295) | a project runs on an older Claude Code |
| `status` reports a forced subagent model (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`) | a project runs where routing is forced |
| Reviewer sends back a mutation that breaks only part of its AC | a migration's back-fill review accepts one ([Pilot lessons](../pilot/lessons.md)) |
| `next` serves more than one intent at a time | an owner step on one intent holds back another intent's builders |
| Test logs named per bolt and focus | two reviewers' logs overwrite each other again ([Pilot lessons](../pilot/lessons.md)) |
| A faster merge gate (levels run once for the merge and the proof) | merges keep taking minutes on a real project |
| `PLAN-GENERATED` requires every output of a generator | a bolt ships one output of a generator that writes two |
| A draft intent cannot declare a method older than the current one (today it is judged by the older rules until approved) | a draft ducks a newer method's checks that way |
| Project rules scoped to an agent role (dropped from M22 B219) | a rule meant for builders keeps reaching reviewers |
