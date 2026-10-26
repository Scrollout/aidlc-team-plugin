---
type: Design
title: OKF
description: How the plugin writes, indexes and validates OKF v0.2 bundles, following the official spec and its reference implementation.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T09:45:00Z }
---

# Official sources
- The format's canonical repository holds the spec, a reference implementation and sample bundles; a frozen snapshot of it elsewhere has an identical `SPEC.md`.
- Its reference implementation and sample bundles are the conventions this plugin copies. Where they differ from earlier house rules, they win.

# Concept docs
- Frontmatter: `type` (required), then `title`, `description` (one sentence), `tags`, `status`, `generated`, `verified`, `stale_after`, `sources`, as in the sample bundles. Producer keys are allowed (we add `verified_hash` and unit fields).
- `generated: { by: <producer>/<version>, at: <ISO 8601 with offset> }` on every doc an agent writes; `verified` with a `human:<id>` actor for owner approvals ([State](state.md)).
- Body: structural markdown with top-level `#` sections (`# Definition`, `# Rows`, …), no required sections. Citations are `[^id]` footnotes keyed to `sources`.
- Links: bundle-relative `/dir/doc.md` (recommended) or relative.
- File names are concept IDs: segments match `[A-Za-z0-9_][A-Za-z0-9_.-]*`.

# Index files (generated, never hand-written)
`aidlc index` regenerates every `index.md` the way the reference `index.py` does:
- Every directory that contains docs gets one; empty directories get none.
- Entries are grouped under `# <type>` headings, headings sorted; entries sorted by title, case-insensitive: `* [Title](file.md) - description`, with the description taken from frontmatter.
- Every child directory goes under `# Subdirectories` as `* [name](name/index.md) - description`, as in the reference.
- No frontmatter, except `okf_version: "0.2"` kept in the root index.
- Reserved files (`index.md`, `log.md`) are not listed.
- Prose paragraphs already in an index are kept under the heading they sit under; prose under a heading the new index no longer has moves to the top, so none is lost.
- House additions: an entry line that already reads the doc's description plus a hint (`… Load when …`) keeps the hint, and a subfolder's existing description line wins over the one-entry default, so a line written by hand for a new subfolder stays.
- Subdirectory descriptions: the reference uses the child's description when a directory has one entry, otherwise an LLM. We do the same for one entry, otherwise keep the existing line, so generation stays deterministic.
- The docs hook and `aidlc merge` run it; a hand edit is overwritten. Golden test: the output is byte-identical to the indexes in the official `ga4`, `stackoverflow` and `crypto_bitcoin` bundles.

# Log files
As in the sample bundles: optional frontmatter `type: Log`, `title`; date headings `## YYYY-MM-DD`, newest first; entries `- **Verb** text` (Creation, Update, Deprecation, Verified, …).

# Validation
What `aidlc check` reports for a bundle, as errors and house-rule warnings: [OKF validation](okf-validation.md).

: Open Knowledge Format v0.2 specification
: OKF reference implementation (document.py, index.py)
: OKF sample bundles (acme_retail, ga4, stackoverflow, crypto_bitcoin)
