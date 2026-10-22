---
type: Design
title: OKF
description: How the plugin writes, indexes and validates OKF v0.2 bundles, following the official spec and its reference implementation.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T09:45:00Z }
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
    title: Open Knowledge Format v0.2 specification
  - id: okf-ref
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/tree/main/src/reference_agent/bundle
    title: OKF reference implementation (document.py, index.py)
  - id: okf-bundles
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/tree/main/bundles
    title: OKF sample bundles (acme_retail, ga4, stackoverflow, crypto_bitcoin)
---

# Official sources
- The canonical home is `GoogleCloudPlatform/open-knowledge-format`. The copy under `knowledge-catalog/okf` is a frozen snapshot; its `SPEC.md` is identical to the canonical one.[^okf-spec]
- The reference implementation[^okf-ref] and the sample bundles[^okf-bundles] are the conventions this plugin copies. Where they differ from earlier house rules, they win.

# Concept docs
- Frontmatter: `type` (required), then `title`, `description` (one sentence), `tags`, `status`, `generated`, `verified`, `stale_after`, `sources`, as in the sample bundles. Producer keys are allowed (we add `verified_hash` and unit fields).
- `generated: { by: <producer>/<version>, at: <ISO 8601 with offset> }` on every doc an agent writes; `verified` with a `human:<id>` actor for owner approvals ([State](state.md)).
- Body: structural markdown with top-level `#` sections (`# Definition`, `# Rows`, …), no required sections. Citations are `[^id]` footnotes keyed to `sources`.
- Links: bundle-relative `/dir/doc.md` (recommended) or relative.
- File names are concept IDs: segments match `[A-Za-z0-9_][A-Za-z0-9_.-]*`.

# Index files (generated, never hand-written)
`aidlc index` regenerates every `index.md` the way the reference `index.py` does:[^okf-ref]
- Every directory that contains docs gets one; empty directories get none.
- Entries are grouped under `# <type>` headings, headings sorted; entries sorted by title, case-insensitive: `* [Title](file.md) - description`, with the description taken from frontmatter.
- Every child directory goes under `# Subdirectories` as `* [name](name/index.md) - description`, as in the reference.
- No frontmatter, except `okf_version: "0.2"` kept in the root index.
- Reserved files (`index.md`, `log.md`) are not listed.
- Subdirectory descriptions: the reference uses the child's description when a directory has one entry, otherwise an LLM. We do the same for one entry, otherwise keep the existing line, so generation stays deterministic.
- The docs hook and `aidlc merge` run it; a hand edit is overwritten. Golden test: the output is byte-identical to the indexes in the official `ga4`, `stackoverflow` and `crypto_bitcoin` bundles.

# Log files
As in the sample bundles: optional frontmatter `type: Log`, `title`; date headings `## YYYY-MM-DD`, newest first; entries `- **Verb** text` (Creation, Update, Deprecation, Verified, …).

# Validation
The official sources ship no validator tool. They provide the conformance rules (spec §11) and, in the reference implementation, `OKFDocument.parse` and `validate()`, which reject an unterminated frontmatter block, invalid YAML, a frontmatter that is not a mapping, and a missing `type`; the reference agent calls it before writing a doc.[^okf-ref] Third-party validators exist but are not official. Our validator implements exactly those checks as errors, adds the index and log structure rules from §8 and §9, and is golden-tested against the official sample bundles.

Frontmatter is read by a zero-dependency YAML subset: block and flow mappings and sequences, plain (multi-line), quoted and `|`/`>` scalars, comments. Anchors, aliases, tags and directives are reported as `OKF-FM`.

Errors (spec conformance):[^okf-spec]
- `OKF-FM` every non-reserved `.md` has a frontmatter block that is terminated, valid YAML and a mapping (timestamps kept as strings, as the reference loader does).
- `OKF-TYPE` non-empty `type`.
- `OKF-INDEX` an `index.md` has no frontmatter except `okf_version` at the root, and only headed `* [Title](url) - description` lists.
- `OKF-LOG` `log.md` date headings are `YYYY-MM-DD`.
- `OKF-RUNTIME` an `Attested Computation` has `runtime`.

Warnings (house rules; `profile.docs.rules` sets each to `error`, `warning` or `off`; spec codes cannot be changed):
- `HOUSE-INDEX-STALE` an index differs from what `aidlc index` would generate.
- `HOUSE-DESC` missing `title` or `description`.
- `HOUSE-GENERATED` a doc without `generated` (authorship is not detectable, so owner-written bundles set it `off`).
- `HOUSE-LINK` a link that does not resolve (the spec says consumers must tolerate these).
- `HOUSE-SIZE` a doc over its type's cap: Unit, Plan, Intent 12,000 chars; Design, Decision 6,000; others 4,000.

[^okf-spec]: Open Knowledge Format v0.2 specification
[^okf-ref]: OKF reference implementation (document.py, index.py)
[^okf-bundles]: OKF sample bundles (acme_retail, ga4, stackoverflow, crypto_bitcoin)
