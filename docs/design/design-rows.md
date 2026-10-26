---
type: Design
title: Design rows before code
description: Draft - the grid's Domain and Logical rows are checked - a full-lane unit carries a Domain and a Logical section, a standard-lane unit a Logical one, approved with the plan, on the card, and checked by every review.
status: draft
sources:
  - id: aws-domain
    resource: https://github.com/awslabs/aidlc-workflows/blob/d85d0f9bb80cf5dea0bae34bc8327f0015ec0eec/core/aidlc-common/stages/inception/domain-design.md
    title: Reference AI-DLC domain design stage
  - id: aws-functional
    resource: https://github.com/awslabs/aidlc-workflows/blob/d85d0f9bb80cf5dea0bae34bc8327f0015ec0eec/core/aidlc-common/stages/construction/functional-design.md
    title: Reference AI-DLC functional design stage
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T13:19:54Z }
---

# Why
The [Grid](grid.md) has Domain and Logical rows between Units and Source, but nothing checked them: a unit could go from ACs to code with no design, so work crossed components the owner's diagram keeps apart. The owner asked for the project to be built fully vertically, design cells included (2026-10-24).

# What the reference workflows do
- **Domain design** names the logical building blocks: each entity has exactly one owning component, and which component calls which. It is conditional: run "when new components or logical building blocks are needed", skipped for changes to existing ones.[^aws-domain]
- **Functional design** runs per unit of work before code: entities, business rules and the functional spec. Also conditional: skipped for "simple logic changes with no new business logic".[^aws-functional]
- Both are reviewed before code is generated.

# Shape
In the unit doc, so the plan approval covers them and an edit makes the unit stale like any other:
- `# Domain`: the entities the unit adds or changes, the one component that owns each, and how components interact. No technology.
- `# Logical`: the services, interfaces, data shapes and state changes the unit adds or changes, with the decisions behind them (a one-way door links its decision doc).

# Checks
- **Plan lint** (`PLAN-DESIGN`, error): before its first approval, a full-lane unit needs both sections with content, a standard-lane unit `# Logical`. A quick-lane unit needs none. `design: "<why none>"` in the frontmatter waives both, as the reference workflows skip the stages for changes with no new block or logic; `aidlc fix` writes one for a regression fix. Units approved before this check are not linted for it.
- **Card**: a unit with design sections gets a `Design` section naming them in the unit doc at the base, which the builder builds to.
- **Review**: the reviewer checks the diff against the card's design as against its interfaces.

Units: [M10](../roadmap/m10.md).

[^aws-domain]: Reference AI-DLC domain design stage
[^aws-functional]: Reference AI-DLC functional design stage
