# {{id}} {{title}}

Goal: {{goal}}
Lane: {{lane}} ({{laneReason}})
Model: {{model}} ({{modelReason}})
Base: {{base}}
Card: {{hash}}

{{#each rules}}## Project rule: {{name}}
{{text}}
{{/each}}## Done when
No tagged tests are needed in this lane; the checks below must pass.
{{#each acs}}{{this}}
{{/each}}
## Scope
Write only inside:
{{#each scope}}- {{this}}
{{/each}}
## Checks
{{#each checks}}- {{module}}: {{check}}
{{/each}}## Test runs (each in full, as one plain command)
{{#each runs}}- {{level}}: {{run}}
{{/each}}
## Out of scope
{{#each outOfScope}}{{this}}
{{/each}}
## Report
First run `aidlc start {{id}}`. When done or stopped, pipe JSON to `aidlc report {{id}}`:
{"status": "done|stopped", "summary": "...", "stop": "<reason when stopped>"}
