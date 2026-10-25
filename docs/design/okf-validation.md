---
type: Design
title: OKF validation
description: The OKF errors and house-rule warnings the validator reports, and the YAML subset it reads frontmatter with.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T10:28:02Z }
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
    title: Open Knowledge Format v0.2 specification
  - id: okf-ref
    resource: https://github.com/GoogleCloudPlatform/open-knowledge-format/tree/main/src/reference_agent/bundle
    title: OKF reference implementation (document.py, index.py)
---

# Validation
How the plugin writes and indexes bundles: [OKF](okf.md).

The official sources ship no validator tool. They provide the conformance rules (spec §11) and, in the reference implementation, `OKFDocument.parse` and `validate()`, which reject an unterminated frontmatter block, invalid YAML, a frontmatter that is not a mapping, and a missing `type`; the reference agent calls it before writing a doc.[^okf-ref] Third-party validators exist but are not official. Our validator implements exactly those checks as errors, adds the index and log structure rules from §8 and §9, and is golden-tested against the official sample bundles.

Frontmatter is read by a zero-dependency YAML subset: block and flow mappings and sequences, plain (multi-line), quoted and `|`/`>` scalars, comments. Anchors, aliases, tags and directives are reported as `OKF-FM`.

Errors (spec conformance):[^okf-spec]
- `OKF-FM` every non-reserved `.md` has a frontmatter block that is terminated, valid YAML and a mapping (timestamps kept as strings, as the reference loader does).
- `OKF-TYPE` non-empty `type`.
- `OKF-INDEX` an `index.md` has frontmatter other than `okf_version` at the root, or an entry line that is not `* [Title](url) - description` under a heading. Prose paragraphs are allowed: the spec does not forbid them, and real bundles use them.
- `OKF-LOG` `log.md` date headings are `YYYY-MM-DD`.
- `OKF-RUNTIME` an `Attested Computation` has `runtime`.

Warnings (house rules; `profile.docs.rules` sets each to `error`, `warning` or `off`; spec codes cannot be changed):
- `HOUSE-INDEX-STALE` an index differs from what `aidlc index` would generate.
- `HOUSE-DESC` missing `title` or `description`.
- `HOUSE-GENERATED` a doc without `generated` (authorship is not detectable, so owner-written bundles set it `off`).
- `HOUSE-LINK` a link that does not resolve (the spec says consumers must tolerate these).
- `HOUSE-SIZE` a doc over its type's cap, counted in code points over the whole file: Unit, Plan, Intent 12,000; Design, Decision, Research 6,000 (a digest carries its question and sources before any finding; second project); others 4,000. A project whose own docs check caps lower sets `docs.caps` by type, with `default` for every type it does not name (`{ "default": 4000 }`), so `check` and the gate count with its numbers (first migration).

`PROFILE-RULE` (error): a `docs.rules` entry that is not a `HOUSE-*` code set to `error`, `warning` or `off`.

`PROFILE-KEY` (warning): a top-level or `security` key in the project or personal profile that the plugin reads nowhere ([Profile](profile.md)).

[^okf-spec]: Open Knowledge Format v0.2 specification
[^okf-ref]: OKF reference implementation (document.py, index.py)
