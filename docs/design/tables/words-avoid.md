---
type: Design
title: Words to avoid
description: Each word in a sense the canonical model gives another word, and the word to use instead; drawn from the vocabulary in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Word | In the sense of | Use |
|---|---|---|
| *unit* | a work item | bolt (unit stays a test level) |
| *slice* | a delivery step | increment |
| *operation* | one command or query | vertical slice |
| *internal layer* | a layer inside a domain | horizontal layer |
| *bundle* | a piece of the architecture, not the docs bundle | domain |
| *component* | a piece of the architecture | domain, or runtime for a deployable |
| *capability* | a module | domain |
| *schema* | a slice's layer | migration |
| *action* | a slice's right | permission |
| *mode* | how a slice answers | async |
| *part* | a slice's layer | cut |
| *contract* | what a slice reaches | declaration |
| *model* | the AI an agent runs on | AI model |
| *model* | a domain's entities and rules | domain model |
| *request* | a call to an API | call |
