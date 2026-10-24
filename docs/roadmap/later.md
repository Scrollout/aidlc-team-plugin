---
type: Plan
title: Later
description: Ideas kept for after the first real migration, none planned - org rule packs, domain row templates, a CI evaluator agent, other agent hosts, staged checks, reserve and clean.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T10:00:00Z }
---

# Items
Carried since [M2](m2.md) through [M7](m7.md); each comes back as a unit only when a project needs it.
| Item | When it earns a unit |
|---|---|
| Org rule packs (`profile.org`, a pinned git repo of rules) | a second project wants the same rules |
| Domain row templates for the full lane | a full-lane unit needs a domain model before its code |
| CI evaluator agent | CI should judge a change beyond the deterministic checks |
| Other agent hosts | the loop has to run outside Claude Code |
| `check --staged` | checking the whole bundle before each commit gets slow |
| `reserve` and `clean` commands | reserved numbers (migrations) clash in practice |
| `init` and `status` warn when Claude Code is older than `onFailure` needs (v2.1.295) | a project runs on an older Claude Code |
| `profile.ci.wait`: poll the base's CI, and a red base comes first in `next` | a red base goes unnoticed while builders start |
| `status` reports a forced subagent model (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`) | a project runs where routing is forced |
| Reviewer sends back a mutation that breaks only part of its AC | a migration's back-fill review accepts one ([M8 evals report](../pilot/m8-evals-report.md)) |
| `next` serves more than one intent at a time | an owner step on one intent holds back another intent's builders |
