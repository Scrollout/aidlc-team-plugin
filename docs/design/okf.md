---
type: Design
title: OKF
description: What the OKF v0.2 spec requires, what this plugin adds as house rules, and how the validator reports each.
status: draft
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
    title: Open Knowledge Format v0.2 specification
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

**TL;DR:** Spec conformance is the error set: frontmatter with a `type`, and well-formed `index.md` and `log.md`. Everything else, including per-folder indexes, is a house rule the profile can switch between warning and error.

## Spec conformance (errors)
From the spec's conformance section:[^okf-spec]
- `OKF-FM` every non-reserved `.md` has a parseable YAML frontmatter block.
- `OKF-TYPE` every frontmatter block has a non-empty `type`.
- `OKF-INDEX-FORM` an `index.md` has no frontmatter, except `okf_version` in the bundle-root index; its body is headed sections of `* [Title](url) - description` lines.
- `OKF-LOG-FORM` `log.md` date headings are `## YYYY-MM-DD`, newest first.
- `OKF-RUNTIME` a `type: Attested Computation` doc has `runtime` (required for that type).

Index files and links are optional in the spec: a consumer must not reject a bundle for missing indexes or broken links. The validator therefore never treats those as spec errors.

## Spec fields we use
- `title`, `description` (one sentence), `tags`: recommended by the spec; we always write them.
- `status`: `draft` until the owner reviews, then `stable`; `deprecated` instead of deleting.
- `generated: { by, at }`: every doc an agent writes, with `by` in the actor form `<producer>/<version>` (e.g. `claude-code/claude-opus-5-5`).
- `verified: { by: human:<id>, at }`: an owner approval; it puts the doc in the human-reviewed trust tier. See [State](state.md).
- `sources` with `[^id]` footnotes when a doc derives from external material.
- Links: bundle-relative (`/design/grid.md`) or relative; the spec recommends bundle-relative.

## House rules (warning by default, `profile.docs.rules` can raise to error)
- `HOUSE-INDEX` every folder has an `index.md`; the parent index lists it (`* [Design](design/) - …`); each doc is listed in its folder's index. Agents load one index, then one doc. This bundle runs it as an error.
- `HOUSE-LINK` links resolve.
- `HOUSE-TLDR` body starts with `**TL;DR:**`.
- `HOUSE-LOG` the change adds a log entry for each doc it creates or updates.
- `HOUSE-LOAD` index lines end with `Load when …`.
- `HOUSE-SIZE` size caps per type: Unit, Plan, Intent 12,000 chars; Design, Decision 6,000; others 4,000.

## Kept out of the hot path
`research/` and `archive/` have their own index, but the root index lists only the folder, so notes never bloat what agents load first.

## Source
Validator ported from a previous tool's `validate-okf.mjs`, with its house rules separated from spec conformance and its row hashes and timestamp rules dropped.

[^okf-spec]: Open Knowledge Format v0.2 specification
