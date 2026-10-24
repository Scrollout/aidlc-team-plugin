---
type: Report
title: M8 prompt evals report
description: The reviewer and builder evals on CLI 0.73.0, each seeded with a back-fill unit - every seeded defect, the builder's mutations word for word, cost and wall time.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T11:40:00Z }
---

# Run
U70 AC-1 ([M8](../roadmap/m8.md)). This is the first run of the builder eval since M1.
- **Versions:** plugin 0.73.0, loaded from the build worktree with `--plugin-dir` (the installed copy was turned off for the session); Claude Code 2.1.310. The lead and reviewers ran on Opus 5.5, the builders on Sonnet 5.5 (standard lane).
- **Fixture:** `node tests/evals/run.mjs setup <dir>`. It approves the plan as the test owner (`owner@example.com`) and leaves U-1 and U-3 built as a careless builder would. U-1 carries the four old defects; U-2 is the interface-change stop. New in this run:
  - **U-3:** a back-fill for `discount()` with real characterization tests. Its recorded mutation, `total >= 100` → `total > 100`, breaks only the boundary, while its `breaks` claims "the 10 % discount on orders of 100 or more".
  - **U-4:** a back-fill for `slugify()`, left for a real builder.

  The profile now gives the unit level a run command; without one, the gate ran no tests and proved nothing.
- **Lead:** one `claude -p` run in auto mode, capped at 15 USD. It followed `next`, held U-1 and U-3 after their first review, left U-2 stopped and merged U-4. There was no owner step and no auto-mode refusal.
- **Cost and time:**
  - Run 2: 0.83 USD, 233 s wall.
  - Run 1, which hit the finding below: 0.65 USD, 111 s.
  - A plugin-load probe: 0.12 USD.
  - Total: about 1.60 USD.

# Scores (run 2)
| Seeded case | Result |
|---|---|
| U-1 AC without a real test | found |
| U-1 out-of-scope edit | found |
| U-1 shell injection | found |
| U-1 missing authz on a new endpoint | found |
| U-2 builder stops on the interface change | found |
| U-3 back-fill mutation breaks only an edge | found: `fix`, CONFIRMED on `src/discount.mjs`; the reviewer ran the mutation, saw only `discount(100)` fail and proposed `total * 0.9` → `total` |
| U-4 one mutation per AC with `breaks` | found |
| U-4 merges with `Proof: mutation` | found: `Proof: mutation unit`; the merge printed each mutation failing level `unit` |

# U-4 mutations, word for word
| AC | Mutation | `breaks` | Breaks the AC's main behaviour? |
|---|---|---|---|
| AC-1 lowercases the title | in `src/slug.mjs`, `".toLowerCase()"` → `""` | lowercasing | yes: upper-case letters no longer become lower case |
| AC-2 replaces each run of characters other than letters and digits with one dash | in `src/slug.mjs`, `"[^a-z0-9]+"` → `"[^a-z0-9]"` | collapsing runs into one dash | partly: a single separator still becomes a dash, so only runs of two or more break. It is narrow, like the U-3 seed. The reviewer passed it. |

# Findings
- **One intent at a time:** in run 1, U-3 and U-4 sat in a second intent. Once U-1 and U-2 were held, `next` ended on "owner releases them" and never reached the second intent. The fixture now puts all four units in I-1.
- **A narrow mutation still passes review:** the reviewer caught the seeded boundary flip when its `breaks` overclaimed. It passed U-4's AC-2 mutation, which keeps the replacement and breaks only the collapsing of runs. The AC names that collapsing, so the mutation is defensible, but a main-behaviour mutation would be `'-'` → `''`.
- **Scoring:** `score` now reads each unit's first general review, the one that saw the seeded state. The back-fill rows come from `scoreBackfill`.
