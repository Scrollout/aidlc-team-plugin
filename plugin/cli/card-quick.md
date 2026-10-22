# {{id}} {{title}}

Goal: {{goal}}
Lane: {{lane}} ({{laneReason}})
Model: {{model}} ({{modelReason}})
Base: {{base}}
Card: {{hash}}

## Done when
No tagged tests are needed in this lane; the checks below must pass.
{{#each acs}}{{this}}
{{/each}}
## Scope
Write only inside:
{{#each scope}}- {{this}}
{{/each}}
## Checks
{{#each checks}}- {{module}}: {{check}}
{{/each}}
## Out of scope
{{#each outOfScope}}{{this}}
{{/each}}
## Report
First run `aidlc start {{id}}`. When done or stopped, pipe JSON to `aidlc report {{id}}`:
{"status": "done|stopped", "summary": "...", "stop": "<reason when stopped>"}
