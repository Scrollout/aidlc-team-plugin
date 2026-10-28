---
type: Decision
title: <NNNN> Naming
description: How things are named in this codebase, from the plan to the running system, with the rules that check each pattern.
---

# Context
Names chosen one at a time drift: two words for one concept, a short name in one file and a long one in another. One decision for every stage, with a profile `names` rule per pattern, keeps them the same.

# Plan
Set by the method and checked already: `I-<n>` intents, `B-<n>` bolts, `R-<n>` requirements, `B-<n>/AC-<k>` test tags, `bolt/B-<n>` branches, `NNNN-<slug>` decisions.

# Vocabulary
| Concept | Word | Not |
|---|---|---|
| <what it is> | <the one word> | <words to avoid> |

# Code
<folders per vertical slice and layer, files, packages, types, functions, tests: pattern and example each>

# Data
<tables, columns, migrations, data nodes>

# Interfaces
<API paths and operation ids, integration events and their versions, environment variables, config keys>

# Deploy and operation
<apps, images, tags, namespaces, hostnames, secrets, releases, dashboards, alerts>

# Rules
<each pattern above as a profile `names` rule: id, files, find (none for a path rule), pattern, why: this decision>

# Revisit when
<the signal that reopens it>
