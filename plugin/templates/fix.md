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
- AC-1 ({{level}}): Given the input that showed the problem, when it runs, then the result is right; its regression test fails before the fix.
