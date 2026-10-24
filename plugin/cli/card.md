# {{id}} {{title}}

Goal: {{goal}}
Lane: {{lane}} ({{laneReason}})
Model: {{model}} ({{modelReason}})
Review model: {{reviewModel}} (profile models.review)
Base: {{base}}
Card: {{hash}}

{{#each rules}}## Project rule: {{name}}
{{text}}
{{/each}}## Acceptance criteria
Write each as a test tagged {{id}}/AC-<k> at its level, before the code.
{{#each acs}}{{this}}
{{/each}}
## Scope
Write only inside:
{{#each scope}}- {{this}}
{{/each}}
{{#each design}}## Design (build to it; every review checks it)
{{this}}

{{/each}}## Interfaces (read them at the base commit)
{{#each interfaces}}- {{this}}
{{/each}}
## Requirements (meet them; every review checks them)
{{#each requirements}}- {{this}}
{{/each}}
## Reserves
{{#each reserves}}- {{this}}
{{/each}}
## Checks
{{#each checks}}- {{module}}: {{check}}
{{/each}}## Test runs (each in full, as one plain command)
{{#each runs}}- {{level}}: {{run}}
{{/each}}{{#each proof}}The merge gate reverts your changes outside the test paths of {{this}} and reruns those levels: each one holding a tagged test must then fail.
{{/each}}
## Out of scope
{{#each outOfScope}}{{this}}
{{/each}}
{{fixes}}{{mutations}}## Stop and report if
- an interface above has to change
- the scope is too small for the ACs
- an AC is ambiguous

## Report
First run `aidlc start {{id}}`. When done or stopped, pipe JSON to `aidlc report {{id}}`:
{"status": "done|stopped", "summary": "...", "tests": ["<file>: {{id}}/AC-<k>"], "stop": "<reason when stopped>"}
If you changed only tests, add "mutations": [{"ac": "{{id}}/AC-<k>", "path": "<code file the test covers>", "find": "<text there once>", "replace": "<text that breaks it>", "breaks": "<the AC's main behaviour it breaks>"}], one per AC, breaking the main behaviour, not only a boundary or an edge: the gate applies each alone and that AC's level must fail.
