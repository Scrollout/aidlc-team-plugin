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
- Commands: <slice>: <the business use case it serves>, one folder each
- Queries: <slice>: <the business use case it serves>, one folder each
- Events: <Noun><PastTenseVerb>

# Relationships
- <other domain>: <upstream or downstream>, <customer-supplier, conformist, anticorruption layer or published language>
