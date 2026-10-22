---
type: Unit
title: {{title}}
description: {{description}}
scope: [{{scope}}]
{{#each requirements}}requirements: [{{this}}]
{{/each}}generated: { by: {{producer}}, at: {{at}} }
---

# Why
A regression: {{why}}

# Acceptance criteria
- AC-1 ({{level}}): a regression test reproduces the problem and fails before the fix.
