---
type: Bolt
title: {{title}}
description: {{description}}
scope: [{{scope}}]
{{#each requirements}}requirements: [{{this}}]
{{/each}}{{#each issue}}board: { issue: {{this}} }
{{/each}}{{#each after}}after: {{this}}
{{/each}}design: "a regression fix: its test pins the behaviour"
generated: { by: {{producer}}, at: {{at}} }
---

# Why
A regression: {{why}}

# Acceptance criteria
- AC-1 ({{level}}): a regression test reproduces the problem and fails before the fix.
