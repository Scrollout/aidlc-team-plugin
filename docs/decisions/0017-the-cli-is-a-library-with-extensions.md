---
type: Decision
title: 0017 The CLI is a library with extensions
description: The CLI becomes a layered library (foundation kits, domains, adapters, a runtime) with opt-in extensions that plug in through named seams; the core never imports an extension, and the core and each extension have their own line budget.
status: stable
supersedes: "0016"
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T12:00:00Z }
---

# Context
[0016](0016-the-cli-budget-is-5000-lines.md) set one budget of 5,000 lines for the CLI. Consolidating before M19 freed 60 lines: the rules were already data. After M19 the CLI stood at 4,881 lines, with M20 and M21 still to build.

The code had also grown a shape of its own:
- 21 modules in one folder, with five import cycles.
- `state.mjs`, an 850-line hub of approvals, state, next steps and reviews.
- Optional features wired straight into the core: the board, the API contract grammar and the stack packs. A project without them still loaded and counted them.

The plugin asks every project for kinds, layers and one-way dependencies ([0013](0013-a-deterministic-ai-dlc.md)). Its own code had none.

# Options
1. Raise the single budget to 6,000 lines. Nothing about the shape changes.
2. **Lay the CLI out as a library: foundation kits, domains, adapters and a runtime, with optional extensions plugged in through named seams, and give the core and each extension a budget of its own.**
3. Split the plugin into several packages. That breaks the single vendored copy ([0004](0004-vendored-cli.md)).

# Decision
Option 2, laid out in [Library and extensions](../design/library.md):
- `plugin/cli/lib/` holds the core in four layers. `foundation/` kits know nothing of AI-DLC. `domains/` are the method's bounded contexts, `adapters/` speak to the host and git hosting, and `runtime/` wires them.
- `plugin/cli/extensions/<name>/` holds an extension, with its data in `extension.json`. It is enabled by a profile key and plugs into seams the core declares. The core never imports an extension.
- `lib/index.mjs` is the library's public entry: other tools import from it, never from a module's internals.
- **Budgets:** the core (`aidlc.mjs` and `lib/`) at most 4,800 lines, each extension at most 400. The owner's first figure of 4,000 for the core did not hold. Moving the optional features out freed about 500 lines, and the seams, the split hub and M20's sweep add back about 300. Reaching 4,000 would mean packing lines, which 0016 ruled out.

# Why
The budget is there to keep the CLI readable and reviewable. A layered core with one-way dependencies, which the plugin checks on itself with the rules it applies to projects, does that better than a bigger flat folder. Extensions keep optional features out of projects that don't use them, and out of the core's count.

# Revisit when
The core passes 4,500 lines: then a domain moves out to an extension before the budget rises.
