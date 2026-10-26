---
type: Design
title: <the system's architecture, in a few words>
description: <one sentence: what the diagrams below show>
---

# Logical
<the vertical slices and the horizontal layers inside them: what each slice owns and how slices talk (public APIs, events); no technology>
```mermaid
flowchart LR
  subgraph slice_a[<slice>]
    a_api[api] --> a_app[app] --> a_domain[domain] --> a_store[store]
  end
```

# Technical
<the processes, stores, identities and the platform they run on, with the protocol on each edge>
```mermaid
flowchart LR
  client([<caller>]) -->|HTTPS| front[<process>]
  front --> db[(<store>)]
```

# Why
<the decisions these diagrams follow, linked>
