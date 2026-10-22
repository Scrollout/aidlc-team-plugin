# {{id}} {{title}}

Goal: {{goal}}
Lane: {{lane}} ({{laneReason}})
Model: {{model}} ({{modelReason}})
Review model: {{reviewModel}} (profile models.review)
Base: {{base}}
Card: {{hash}}

## Acceptance criteria
Write each as a test tagged {{id}}/AC-<k> at its level, before the code.
{{#each acs}}{{this}}
{{/each}}
## Scope
Write only inside:
{{#each scope}}- {{this}}
{{/each}}
## Interfaces (read them at the base commit)
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
{{/each}}
## Out of scope
{{#each outOfScope}}{{this}}
{{/each}}
{{fixes}}## Stop and report if
- an interface above has to change
- the scope is too small for the ACs
- an AC is ambiguous

## Report
First run `aidlc start {{id}}`. When done or stopped, pipe JSON to `aidlc report {{id}}`:
{"status": "done|stopped", "summary": "...", "tests": ["<file>: {{id}}/AC-<k>"], "stop": "<reason when stopped>"}
