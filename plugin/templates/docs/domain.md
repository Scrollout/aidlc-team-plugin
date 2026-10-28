---
type: Domain
title: <the domain in a few words>
description: <the business capability it owns, in one sentence>
code: <the plural noun of its root aggregate, lower case: also its folder, schema and resource type>
kind: domain
---

# Why
<why this is one bounded context: the language and the data that belong together>

# Glossary
- **<term>**: <its one meaning in this domain>

# Owns
- `<table>`: <what it holds>

# Surface
- Command <slice> (<cut>, …; data <node>; entry <runtime>; …): <the business use case it serves> [I-<n>:US<g>.<s>]
- Query <slice> (<cut>, …; entry <runtime>): <the business use case it serves> [I-<n>:US<g>.<s>]
<one line per slice, its cuts the layers it cuts, each part after them only where it applies: data, entry, permission, async, emits, consumes, calls>
- Events: <Noun><PastTenseVerb>, the integration events other domains consume

# Relationships
- <other domain>: <upstream or downstream>, <customer-supplier, conformist, anticorruption layer or published language>
