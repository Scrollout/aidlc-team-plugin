---
type: Principles
title: Principles
description: The ten rules every design choice in this plugin is checked against.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** The workflow lives in code; prose explains it. State is derived, specs come first, humans decide only what is strategic, and everything stays small.

1. **Enforce at the action.** A rule that matters is a CLI check or a hook that blocks when it is broken. A rule no script can check is advice, and is written as advice.
   *Why:* a previous tool's prose gates and self-reported ledger let the model drift unnoticed.
2. **Derive state, don't record it.** Progress is computed from git and the docs bundle. There is no ledger, no event log, no handoff file.
   *Why:* recorded state goes stale and grows; a pilot project carried a 650 KB ledger and a handoff with two "CURRENT" sections.
3. **One stage model: the grid.** Intent → Units → Domain → Logical → Source → Deployment → Operation. Depth varies by lane; a row is skipped by rule, never by the model's choice.
   *Why:* a previous tool kept two competing stage models; AWS runs 33 stages.
4. **Spec first, with the why.** Code changes only under an approved unit. Every requirement and decision states its reason.
   *Why:* docs and code stay aligned only if the doc changes first; the reason guides later changes.
5. **AI proposes, human decides.** The owner approves intents, plans, one-way doors and releases. Nothing else waits on a human.
   *Why:* approvals at the plan are cheap; re-stamps after the work are what made a previous tool slow.
6. **Right-sized context.** Each agent gets one card and the docs it links to. The always-on context stays inside its budget.
   *Why:* accuracy and cost both degrade as context fills.
7. **Fresh eyes verify.** The reviewer never shares context with the builder, returns structured findings, and gets at most two rounds before the owner decides.
   *Why:* a capped loop prevents the five-round fix chains seen in a pilot project.
8. **Name neutral.** Nothing the plugin writes into a project names the plugin. Projects own their profile and templates.
   *Why:* A previous tool's names leaked into trailers, requirements and CI pins.
9. **Small and few.** The budgets in [Overview](../design/overview.md) are hard limits, checked by this repo's tests.
   *Why:* a previous tool's skills were squeezed under a cap instead of being simplified.
10. **No ceremony for the plugin itself.** This repo is built with a plain plan, tests and review; it never governs its own process with its own process.
    *Why:* a previous tool spent its effort enforcing its own rules and delivered none of its requirements.
