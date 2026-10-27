---
type: Intent
title: <goal in a few words>
description: <one sentence>
request: [Q-<n>]
pathway: <greenfield, feature or brownfield, as aidlc intake proposed and the owner confirmed>
lane: <standard or full, as aidlc intake proposed and the owner confirmed>
requirements: [R-<n>]
---

# Goal
<what changes for whom, each line citing its source: [Q-<n>.<k>] a request sentence, [Q<k>] an answer, [A<k>] an assumption>

# Why
<the reason>

# Personas
- **<Name>**: <who they are and what they want> [Q-<n>.<k>]
<one per kind of user the request names; remove both sections and set onePersona: "<why>" when there is one>

# Stories
- US1.1 As a <persona>, I want <capability>, so that <benefit>. R-<n> [Q-<n>.<k>]
<each story one feature or use case, served by a vertical slice through every layer it needs>

# Units
## <name of the unit of work, lower case, as a path segment>
- Kind: <service, spec, ui, packaging or library>
- Modules: <the profile's modules it changes>
- Responsibilities: <what it owns and delivers> [Q-<n>.<k>]
- Stories: <its story ids, US1.1>
- Requirements: <the requirements it meets, its non-functional ones among them, R-<n>>
- Risks: <what could sink it>
- Measures: <a measurable outcome> [M1]
- Depends on: <the units of work its code needs, or none>
- Slices: <Command or Query> <slice> [US<g>.<s>], one per vertical slice that serves its stories
<optional: Integration (APIs, shared data, events), Deployment (standalone, shared or embedded), Complexity (S, M, L or XL), Bolts, PRFAQ>

# Increments
- I-<n>.1 <the walking skeleton, end to end on the target>: <its bolts, once cut>
- I-<n>.2 <the next increment, end to end>: <its bolts, once cut>
<each rule or limit an increment sets says why, as in "quantity 1-10: bulk buyers go through sales">

# Risks
- <what could sink this, riskiest first; the first increments retire it>

# Success measures
- M1 <measurable outcome>

# Questions
- Q1 <a question for the owner>
  - a) <option>: <its consequence>
  - b) <option>: <its consequence>
  - Answer: <the letter the owner picked, then their words>
- Q<k> Read-back: <a short summary of what was understood, asked last>
  - a) looks correct: the docs are written from it
  - b) request changes: revise and read back again
  - Answer: <a or b>

# Corners
- <each surface of the corner checklist (aidlc persona product-analyst), one per line: - Money: R-<n>, [A<k>], or n/a: and why>

# Assumptions
- A1 <what the intent takes as given; the owner confirms it by approving; remove the section when there is none>

# Out of scope
- <what this intent does not do, citing the request sentence it answers>

## Open questions
- <unanswered owner questions; remove when answered>
