---
type: Design
title: Kinds and layers
description: What each module kind may depend on, and the layers inside a domain pointing inward; drawn from vocabulary.kindRules and layerRules in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| from \ to | domain | pipeline | foundation | adapter | runtime | extension | delivery |
|---|---|---|---|---|---|---|---|
| domain | surface |  | yes |  |  |  |  |
| pipeline | surface |  | yes |  |  |  |  |
| foundation |  |  | yes |  |  |  |  |
| adapter |  |  | yes |  |  |  |  |
| runtime | yes | yes | yes | yes |  |  |  |
| extension | surface |  | yes |  |  |  |  |
| delivery | yes | yes | yes | yes | yes | yes | yes |

```mermaid
flowchart LR
  interface --> application
  interface --> model
  application --> model
  infrastructure --> model
```
