# {{id}} {{title}}

Goal: {{goal}}
Lane: {{lane}} ({{laneReason}})
Model: {{model}} ({{modelReason}})
Base: {{base}}
Card: {{hash}}

## Scope
Write only inside:
{{#each scope}}- {{this}}
{{/each}}
## Checks
{{#each checks}}- {{module}}: {{check}}
{{/each}}
## Report
First run `aidlc start {{id}}`. When done or stopped, pipe JSON to `aidlc report {{id}}`:
{"status": "done|stopped", "summary": "...", "stop": "<reason when stopped>"}
