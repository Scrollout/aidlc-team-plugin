# {{id}} {{title}}

Goal: {{goal}}
Lane: {{lane}} ({{laneReason}})
Model: {{model}} ({{modelReason}})
Review model: {{reviewModel}} (profile models.review)
Base: {{base}}
Card: {{hash}}

{{#each rules}}## Project rule: {{name}}
{{text}}
{{/each}}{{#each why}}## Why
{{this}}{{/each}}## Acceptance criteria
Write each as a test tagged {{id}}/AC-<k> at its level, before the code.
{{#each acs}}{{this}}
{{/each}}
## Scope
Write only inside:
{{#each scope}}- {{this}}
{{/each}}{{#each slices}}## Slices
{{this}}{{/each}}
{{#each design}}## Design (build to it; every review checks it)
{{this}}

{{/each}}## Interfaces (read them at the base commit)
{{#each interfaces}}- {{this}}
{{/each}}{{#each references}}## References (named above; read them at the base commit)
{{this}}{{/each}}
## Requirements (meet them; every review checks them)
{{#each requirements}}- {{this}}
{{/each}}
## Reserves
{{#each reserves}}- {{this}}
{{/each}}
## Checks
{{#each checks}}- {{module}}: {{check}}
{{/each}}{{#each data}}## Data
{{this}}{{/each}}{{#each names}}## Names
The merge gate checks each name and path you add against these; use the naming decision's words for the rest, which the reviewer checks.
{{this}}{{/each}}{{#each reference}}## Reference
{{this}}{{/each}}{{#each deps}}## Dependencies
{{this}}{{/each}}{{#each platform}}## Platform
{{this}}{{/each}}## Test runs (each in full, as one plain command)
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
First run `aidlc start {{id}}`. When done or stopped, write the JSON to a file in your temp folder and run `aidlc report {{id}} <file>` (pipes and heredocs are refused):
{"status": "done|stopped", "summary": "...", "tests": ["<file>: {{id}}/AC-<k>"], "stop": "<reason when stopped>"}
If you changed only tests, or reverting your change cannot fail your tests (it wires them into the level's run), add "mutations": [{"ac": "{{id}}/AC-<k>", "path": "<code file the test covers>", "find": "<text there once>", "replace": "<text that breaks it>", "breaks": "<the AC's main behaviour it breaks>"}], one per AC, breaking the main behaviour, not only a boundary or an edge: the gate applies each alone and that AC's level must fail.
