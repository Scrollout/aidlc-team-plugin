---
type: Decision
title: 0029 A slice holds its own layers
description: A domain's code is laid out slice first - each slice one folder holding a sub-folder per layer it cuts, beside the domain's shared model, infrastructure, client, events and router - so a slice is added, reviewed and removed as one folder; it amends the stack packs' layout of 0026.
status: accepted
date: 2026-10-29
decision-makers: the owner
consulted: the lead
informed: projects, through the stack packs and upgrade
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-29T13:30:00Z }
---

# A slice holds its own layers

## Context and Problem Statement
The stack packs lay a domain out layer first: `<domain>/ui/cli/<slice>`, `<domain>/interface/<slice>`, `<domain>/application/<slice>`. One operation is spread over three or four folders, a bolt's scope needs a glob per layer, and deleting a slice means finding its pieces in each. A vertical slice is one operation end to end; its code should be where it is read, changed and removed together. Which layout do the packs give a domain?

## Decision Drivers
* A slice is added, reviewed and removed as one unit.
* The horizontal layers stay checked: a slice's interface calls inward, never the reverse, which in Go needs a package per layer.

## Considered Options
* Layer first: `<domain>/<layer>/<slice>`, as the packs have it.
* Slice first, a file per layer: `<domain>/<slice>/{route, handler, …}`.
* Slice first, a sub-folder per layer: `<domain>/<slice>/<layer>/`.

## Decision Outcome
Chosen option: "Slice first, a sub-folder per layer", because a slice becomes one folder tree while each layer stays a package the layer and slice checks read through imports.

- A domain holds its slices, each `<domain>/<slice>/` with the layers it cuts as sub-folders (`ui/cli`, `ui/template`, `ui/web`, `interface`, `application`), and the domain's shared parts beside them: `model`, `infrastructure`, `client`, `events`, and `interface`, the router mounting every slice's route. A slice name is a verb and the domain's noun, so it never collides with a shared part.
- The packs' `sliceFolder`, `slicePaths` and `scaffold.slice` say this as data; the slice checks read the slice from the path's first segment under the domain and its layer from the next. A folder holding no layer folder is no slice.

### Consequences
* Good, because a slice is one folder: one glob in a bolt's scope, one place to review, one folder to remove.
* Good, because the layer rules and `SLICE-IMPORT` keep working on imports, now between sibling folders.
* Bad, because projects on the layer-first layout move their slices, once, through a superseding decision of their own.

### Confirmation
The packs' reference domains and scaffold use the layout; the slice tests pass on it; a project's `aidlc scaffold` writes it.

## Pros and Cons of the Options

### Layer first
* Good, because each layer is one folder per domain.
* Bad, because one operation is spread over several folders.

### Slice first, a file per layer
* Good, because the flattest tree.
* Bad, because in Go a folder is one package, so nothing checks that the interface calls only inward.

### Slice first, a sub-folder per layer
* Good, because one folder per slice and a package per layer.
* Bad, because one level deeper.

## More Information
Vertical slices and horizontal layers stay the architecture of [0026](0026-a-slice-declares-the-layers-it-needs-and.md) and rule 9; this decision changes where a slice's layers sit, not which layers a slice declares. Deriving every name of a slice from one set of coordinates (system, domain, resource, operation, cut) is a separate change to the naming registry.
