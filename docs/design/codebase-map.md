---
type: Design
title: Codebase map
description: A generated doc in the project's bundle showing the codebase as a tree of modules, with each module's data, public paths and dependencies, rewritten at every merge so it never drifts.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T00:10:00Z }
---

# Why
The owner asked on the first migration (2026-10-24) for a tree in the project's docs that shows the codebase's structure. A tree kept by hand drifts with the first merge that forgets it, so the plugin writes it from what it already checks: the profile's modules and the project's dependency graph.

# Shape
- Files: `<bundle>/codebase-map.md` (or the bundle path in `profile.map`) and, with a graph, `codebase-map-graph.md` and `codebase-map-table.md` beside it, all `type: Map`, linked to each other. Three small pages, because agents load small docs and projects cap doc size (first migration: one page was 7,600 chars against a 4,000 cap). Each opens with a `**TL;DR:**` line. `"map": false` turns it off. Written only when the profile has `modules`.
- **Tree:** the folders that hold a module, as a tree from the repo root, each module's folder naming its id, the data it owns and its public paths ([Data ownership](data-ownership.md), [Module surfaces and cycles](module-surface.md)). A top-level folder no module covers is listed as `(no module)`, so a gap shows.
- **Dependencies:** a Mermaid flowchart of module to module edges from `architecture.graph`, which GitHub renders as a picture (short node ids, the module as the label), and a table of each module's dependencies and users. Without a graph the map is the tree page only.
- The doc is generated like the indexes: never edited by hand, rewritten only when its body changes, with `generated` set then.

# When
- At every merge, with the indexes and log, in the trial merge before any check runs, so the map is committed with the merge that changed the structure ([Merge gate](gate.md)). The graph runs once for the map and the architecture checks.
- On demand: `aidlc map` writes it in the work tree, e.g. to add it the first time.
