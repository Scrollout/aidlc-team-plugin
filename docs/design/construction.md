---
type: Design
title: Construction by proof
description: Bolts bound to one domain, parallel work by ownership, a run-time proof per level, security findings disposed by the owner, increment 1 done on its target, requirements delivered only by released tests, one-AC fix bolts, escape hatches that expire, and a retro that measures.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T10:30:00Z }
---

# Why
A figure the plugin shows can lie: a requirement counted as delivered with no image built, a skeleton counted as done before it ran on dev, a fix bolt carrying a feature and a design change, a security finding merged as "plausible". Every figure the plugin shows must be a proof, and every escape hatch visible ([Increments and bolts](increments-and-bolts.md)).

These rules hold in a v2 project (its profile has `system`). The plan rules judge an intent approved under method 4 (`method.since`), and a bolt or fix bolt not yet approved, so earlier work keeps its rules.

# Binding
A bolt's binding is its `modules`, read against the profile's kinds: a domain (`domain` or `pipeline`, `construction.vertical`) or a horizontal module (any other kind). Outside increment 1:
- `BOLT-BIND`: a bolt binding no module, a horizontal module beside another module, or one horizontal module without `neededBy: B-<v>` naming a bolt of the same increment that binds a domain.
- `BOLT-SPAN`: a bolt binding two or more domains, or whose scope reaches a domain module it does not bind.
Increment 1, the walking skeleton, may span. Both block approval.

# Parallel by ownership
`next` starts bolts side by side only when their scopes are disjoint and their bindings share no module. A file two bindings need goes to a foundation bolt merged first.

# A proof that runs
In the gate's proof-revert, a level whose run fails with a compile error proves nothing: its output matching the stack pack's `compileError` pattern (or the level's own) is `PROOF-AC`. A bolt whose revert cannot run reports a mutation per AC instead, proved as a back-fill is ([Back-fill](backfill.md)). The proof stays per level: the level holding each top-level AC's tagged test must fail at run time.

# Security findings
`REVIEW-SECURITY`: a finding in the latest `security` round, at any confidence, blocks the merge until the owner runs `aidlc dispose B-<n> F-<k> fixed|accepted "<reason>" [--until <date>]`. `F-<k>` numbers that round's findings. An accepted finding past its `until` blocks again.

# Increment 1 runs on its target
- `INCR-SKELETON`: with `deploy` in the profile, increment 1 of an intent holds a top-level AC and a bolt binding a `delivery` module; from method 13, its first bolt's first slice cuts every layer the pack has, any `ui` form counting as `ui` ([Building a slice](slice-method.md#proved)). It blocks approval.
- `INCR-DONE`: an increment is done when its bolts are in the last passing release and its smoke passed. The gate refuses a bolt of a later increment while increment 1 is not done.

# Delivered means proven
At every merge, `architecture/traceability-i-<n>.md` is generated for each intent (with its digest): a row per bolt AC, linking requirement, AC tag, bolt, tagged test files, merge commit and release. A requirement is delivered only when each bolt citing it is merged and in the last passing release (or a tag, with no `deploy` or `release`), and each AC of those bolts has a tagged test at that commit. `status` lists the requirements not delivered; v1's count of citations stays for v1 projects only.

# Fix bolts
`FIX-SHAPE`: a bolt with no intent has exactly one AC, and its scope reaches neither the bundle's decisions nor a one-way door. The gate's proof is the regression test failing before the fix. It blocks approval.

# Escape hatches
Each hatch is the owner's (a stamp or an owner command), may carry `until: <date>`, and `status` lists the live ones:

| Hatch | Where `until` sits |
|---|---|
| fix bolt | the bolt's front matter |
| waiver (`endToEnd`) | the intent's front matter |
| boundary `except` | the decision it names |
| `delegate` | `aidlc delegate <classes> --until <date>` |
| security `accepted` | `aidlc dispose … --until <date>` |

A hatch in a doc past its `until` is `HATCH-EXPIRED`, an error of `check`. A delegation or an accepted finding past it lapses on its own.

# Retro
`retro I-<n>` adds, per intent:
- lead time from the intent's approval to its last passing smoke;
- predictability: increments shipped of those committed;
- merge refusals by binding, and by the layer each finding sits in, recorded at each refused merge;
- the owner's dwell time per approval: from the doc's last commit before the stamp to the stamp;
- the hatches used.

# Board
`board.binding` is derived like `board.wave`: the bolt's domain, its horizontal module's kind, `fix` for a fix bolt, or `span` for a spanning bolt of increment 1. `github.fields` maps it to an option ([Board](board.md)).

Bolts: [M19](../roadmap/m19.md) B182, B183, B184, B185, B186, B187, B188, B189, B190.
