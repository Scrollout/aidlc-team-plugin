---
type: Design
title: Design rows before code
description: The grid's Domain and Logical rows are checked - a full-lane bolt carries a Domain and a Logical section, a standard-lane bolt a Logical one, approved with the plan, on the card, and checked by every review.
status: stable

generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T13:19:54Z }
---

# Why
The [Grid](grid.md) has Domain and Logical rows between Bolts and Source, but nothing checked them: a bolt could go from ACs to code with no design, so work crossed domains the owner's diagram keeps apart. The owner asked for the project to be built fully vertically, design cells included (2026-10-24).

# What the reference workflows do
- **Domain design** names the logical building blocks: each entity has exactly one owning domain, and which domain calls which. It is conditional: run "when new components or logical building blocks are needed", skipped for changes to existing ones.
- **Functional design** runs per unit of work before code: entities, business rules and the functional spec. Also conditional: skipped for "simple logic changes with no new business logic".
- Both are reviewed before code is generated.

# Shape
In the bolt doc, so the plan approval covers them and an edit makes the bolt stale like any other:
- `# Domain`: the entities the bolt adds or changes, the one domain that owns each, and how domains interact. No technology.
- `# Logical`: the services, interfaces, data shapes and state changes the bolt adds or changes, with the decisions behind them (a one-way door links its decision doc).

# Checks
- **Plan lint** (`PLAN-DESIGN`, error): before its first approval, a full-lane bolt needs both sections with content, a standard-lane bolt `# Logical`. A quick-lane bolt needs none. `design: "<why none>"` in the frontmatter waives both, as the reference workflows skip the stages for changes with no new block or logic; `aidlc fix` writes one for a regression fix. Bolts approved before this check are not linted for it.
- **Card**: a bolt with design sections gets a `Design` section naming them in the bolt doc at the base, which the builder builds to.
- **Review**: the reviewer checks the diff against the card's design as against its interfaces.

Bolts: [M10](../roadmap/m10.md).

: Reference AI-DLC domain design stage
: Reference AI-DLC functional design stage
