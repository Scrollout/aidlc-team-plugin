---
type: Principles
title: Principles
description: The eleven rules every design choice in this plugin is checked against.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

1. **Enforce at the action.** A rule that matters is a CLI check or a hook that blocks when it is broken. A rule no script can check is advice, and is written as advice.
   *Why:* a rule kept in prose, or progress the model reports about itself, drifts without anyone noticing.
2. **Derive state, don't record it.** Progress is computed from git and the docs bundle. There is no ledger, no event log, no handoff file.
   *Why:* recorded state goes stale, contradicts itself and grows without bound; derived state is always current.
3. **One stage model: the grid.** Intent → Units → Domain → Logical → Source → Deployment → Operation. Depth varies by lane; a row is skipped by rule, never by the model's choice.
   *Why:* two stage models compete for every decision, and a long fixed stage list costs more than most changes need.
4. **Spec first, with the why.** Code changes only under an approved unit. Every requirement and decision states its reason.
   *Why:* docs and code stay aligned only if the doc changes first; the reason guides later changes.
5. **AI proposes, human decides.** The owner approves intents, plans, one-way doors and releases. Nothing else waits on a human.
   *Why:* an approval at the plan is cheap; asking again after the work stalls it.
6. **Right-sized context.** Each agent gets one card and the docs it links to. The always-on context stays inside its budget.
   *Why:* accuracy and cost both degrade as context fills.
7. **Fresh eyes verify.** The reviewer never shares context with the builder, returns structured findings, and gets at most `review.fixRounds` fix rounds per focus (3 by default) before the owner decides.
   *Why:* an uncapped fix loop can run on without converging; a cap hands the call to the owner.
8. **Name neutral.** Nothing the plugin writes into a project names the plugin. Projects own their profile and templates.
   *Why:* a tool's name in a project's trailers, requirements or CI ties the project to that tool.
9. **Small and few.** The budgets in [Overview](../design/overview.md) are hard limits, checked by this repo's tests.
   *Why:* small parts are easier to read, check and change; a budget met by compressing text instead of simplifying gains neither.
10. **No ceremony for the plugin itself.** This repo is built with a plain plan, tests and review; it never governs its own process with its own process.
    *Why:* effort spent governing the tool's own process is effort taken from its requirements.
11. **Values are data.** Every name, word, heading, path, pattern, threshold, default, mapping, message and doc grammar lives in `cli.json`, an extension's data, a template or the profile. Code holds logic, the protocol of the tools it calls (git, gh, HTTP, Node) and keys into the data; a test fails on any other literal. Where feasible, several values form one structured object (JSON, YAML), never a delimited string, and the CLI serves its answers as JSON and an action as an object naming its command ([Values as data](../design/values.md)).
    *Why:* a value in code changes only with a release and cannot be reviewed or overridden; a structured object needs no parsing, by the code or by a caller.
