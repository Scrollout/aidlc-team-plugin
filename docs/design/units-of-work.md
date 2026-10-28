---
type: Design
title: Units of work
description: An intent lists its Units of work as the method's Mob Elaboration and Units Generation give them, each with its kind, modules, responsibilities, stories, requirements, risks, measures and dependencies, every story in a Unit, the dependencies acyclic, and each bolt's modules in a Unit of its intent.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-28T01:30:00Z }
---

# Why
The method decomposes an intent into Units: cohesive, loosely coupled work elements, each built by one team. Mob Elaboration gives each Unit its user stories, non-functional requirements, risks, measurement criteria traced to the intent and suggested bolts, and a PRFAQ where useful. Units Generation names each Unit, gives it a kind, maps every story to the Units that implement it, and records the Units' dependencies as an acyclic graph. Without Units, an intent's stories, risks and measures are not tied to the code that delivers them, and nothing says which work can run in parallel. The domain docs stay the system-wide Domain Design: each entity has one owning domain ([Canonical model](canonical-model.md)).

# The Units section
Method 11 adds `# Units` to an intent, after `# Stories`. Each Unit is a sub-heading, its name a lower-case path segment, with one line per part:

| Part | Holds | Needed |
|---|---|---|
| Kind | `service`, `spec`, `ui`, `packaging` or `library` | yes |
| Modules | the profile's modules the Unit changes | yes |
| Responsibilities | what the Unit owns and delivers, with its source | yes |
| Stories | the ids of its stories, `US<g>.<s>` | yes |
| Requirements | the requirements it meets, its non-functional ones among them | yes |
| Risks | what could sink the Unit | yes |
| Measures | measurable outcomes, each citing a success measure `M<k>` of the intent | yes |
| Depends on | the Units whose code its own needs, or `none` | yes |
| Slices | the vertical slices that serve its stories, `<Kind> <slice> [US<g>.<s>]` each ([planned](vertical-slices.md#planned-before-built)); from method 13 each with its declaration, `<Kind> <slice> (<cut>, …; …) [US<g>.<s>]` ([Building a slice](slice-method.md#one-grammar)) | from method 12 |
| Integration | APIs, shared data and integration events with other Units | no |
| Deployment | standalone, shared or embedded | no |
| Complexity | S, M, L or XL | no |
| Bolts | its bolts, once cut | no |
| PRFAQ | a link to its press release and FAQ | no |

Stories carry stable ids: `- US1.1 As a <persona>, I want <capability>, so that <benefit>.` Success measures carry ids: `- M1 <measurable outcome>`.

A story may belong to several Units when it crosses them; the domain-driven default is one Unit per domain the intent changes. A bolt keeps binding one domain ([Increments and bolts](increments-and-bolts.md)), and its modules belong to a Unit of its intent, so a bolt sits inside a Unit as the method has it.

# Checks
`UNIT-WORK`, an error that blocks the intent's approval, on a draft intent of a v2 project judged by method 11:
- no Unit under `# Units`, a Unit named twice or not as a path segment;
- a Unit missing a needed part, or a kind outside the list;
- a module that is not in the profile, a requirement the intent does not cite, a measure citing no success measure of the intent;
- a story id that is not a story of the intent, a story with no id, a story in no Unit, a Unit with no story;
- a dependency on a Unit the intent does not list, or a cycle;
- a live bolt of the intent whose modules are in no Unit.

The headings, part labels, kinds and id patterns are data in the intake CLI extension ([Values as data](values.md)).

Bolts: [M27](../roadmap/m27.md) B243; [M28](../roadmap/m28.md) B248.
