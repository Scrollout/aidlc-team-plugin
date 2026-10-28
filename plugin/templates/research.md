# Research for {{doc}}

Question: {{question}}
Asked in: {{file}}
AI model: {{model}}

## Project context (read first)
- The docs bundle: {{index}}
{{#each stack}}- Stack: {{this}}
{{/each}}
{{#each rules}}## Project rule: {{name}}
{{text}}
{{/each}}## Sources the owner named
{{#each sources}}- {{this}}
{{/each}}
## Budget
Read at most {{max}} sources. Keep the whole digest, frontmatter included, under {{cap}} characters.

## Return this digest; the lead writes it unchanged to {{out}}
The lead then runs `aidlc check {{out}}` and the project's own doc checks, and sends any finding back to you to fix; it never edits the digest itself.
---
type: Research
title: "<the question in a few words>"
description: "<the answer in one line>"
question: {{questionYaml}}
generated: { by: claude-code/<your AI model id>, at: <the current UTC time> }
sources:
  - id: <short id>
    resource: <url>
    title: <page title>
---

# Options
<two or three options; each with its evidence as [^id] citations, official sources first>

# Secondary sources
<blogs, forums or answers you used, marked as such; none is the only support for an option>

# Open doubts
<what the sources do not settle>

[^<id>]: <page title>
