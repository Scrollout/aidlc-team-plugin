---
type: Design
title: Bolt card
description: The generated, read-only brief one builder works from and one reviewer checks against, for a bolt (`U-<n>` in a v1 project).
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T15:30:00Z }
---

# Why per bolt, not shared
- A shared card is a write hotspot for parallel workers and forces each one to load every bolt.
- What bolts share (the DAG, interfaces) lives in approved docs that stay frozen during construction; the card links to them, pinned to the base commit.

# Contents (≤ 100 lines)
The cap counts lines (a line is what a reader scans; a char cap only squeezes wording), without the findings and mutations a review round adds (a bolt that fitted must not need a re-approval for its fix round) and without the sections the profile writes (Data, Names, Dependencies, Platform), which grow with the project, not the bolt. Plan lint warns `PLAN-CARD` on any unmerged bolt whose card would pass the cap, from the doc on disk, before approval and again when a rule or template grows an approved card, so `card` never refuses a bolt `next` hands out unwarned.
- Bolt ID, title, goal, lane, AI model (see [Team](team.md#model-routing)), base commit, card hash.
- **Why:** the bolt's `# Why` as written, so the builder knows the business reason behind each rule and limit.
- **Project rules:** each `.aidlc/rules/*.md` at the base commit, before the ACs, except a rule named after a `profile.focus` key, which only that focus's reviewer reads. Builders run without `CLAUDE.md`, so this is how a project's conventions reach them; the rules count toward the cap.
- ACs with IDs; each becomes a test tagged `B-<n>/AC-<k>`.
- **Scope:** globs the builder may write.
- **Slices:** for each slice the bolt lists, the scaffold command, then its cuts as ordered steps, test first, from `migration` up to `ui` ([Building a slice](slice-method.md#built)).
- **Interfaces:** each line of the bolt's `Interfaces` section as written, what it consumes or provides, each link followed by the path it resolves to at the base commit (a URL as written). An outside source, a web page or a database, is written there as a link or a name with its location.
- **References:** each intent, bolt, requirement or decision (`0003`) the goal, why, ACs or out of scope name and the card lists nowhere else, with its path at the base, or `no such doc`, so a card never names "the suite of B-13" with no path.
- **Requirements:** the requirement docs the bolt cites, named as their files are, which the builder meets and every review checks.
- **Findings to fix:** in a fix round, the findings of each focus whose last verdict for the current diff is `fix`. A merge the gate refused on the current diff lists its findings too. After an escalation the owner re-approved, its findings are listed as answered by that re-approval, for the reviewer to report again only if one still holds against the spec as it is now.
- **Test runs:** every level's `run`; the builder and the reviewer run each in full, and the gate again on the merge result, then once more with the bolt's code reverted, when each level holding a tagged test must fail.
- **Reserves:** tokens no two bolts in flight may share: a migration number `regional/0005`, or an exclusive runtime resource a bolt's tests need, such as `ci-cluster/port-25` ([Parallel builders](parallel.md)).
- **Checks:** the commands for the bolt's modules, by `id` (or `name`), and the project's `checks`, run on every merge.
- **Data:** the data the bolt's modules own and the shared data; any other data only through its owner ([Data ownership](data-ownership.md)).
- **Names:** the naming rules whose files overlap the bolt's scope ([Naming rules](naming.md)).
- **Platform:** the `deploy.platform` refs, where the deploy target is already defined, to build on ([Deployment and Operation](operations.md)).
- **Out of scope** and **stop and report if** (interface change, scope too small, AC ambiguous).
- **Report format:** what the builder returns.

# Rendering
- The template is `plugin/cli/card.md`, copied into projects with the CLI. A project's `.aidlc/templates/card.md` overrides it.
- Card hash: sha256 of the bolt doc at the base plus the rendered card without its base line, so a base that moved for other bolts leaves the hash, and the reviews made against it, current.
- `aidlc card` also writes `.git/aidlc/cards/B-<n>.json` (hash, base, lane, AI model). This is runtime data, never committed, and re-rendering rewrites it. `start` checks its base and the `model` hook compares against its AI model.
- AI model routing defaults sit in `cli.json`; `profile.models` overrides them, including `complex` globs. The card prints the builder's `Model:` and, on the standard card, the `Review model:` from `models.review`.

# Rules the CLI enforces
- Rendered from `git show <base>:<bolt doc>`, so worktree edits cannot change a card.
- `aidlc card` refuses an unapproved or stale bolt.
- Before parallel start, bolts whose scopes overlap or whose reservations collide are refused.
- The card hash goes into the merge trailer `Card: <hash>`; the reviewer gets the same card, and a mismatch fails the merge gate. It leaves out the frontmatter the approval hash leaves out (`board`, `priority`, `hold`), so planning a board value keeps recorded reviews.
- A worker never changes an interface. It stops and reports; the lead updates the spec, the owner re-approves if it is a one-way door, and affected cards are re-rendered.

# Quick lane
The card keeps goal, ACs, scope, checks and out of scope, and drops what only matters for tests and review: interfaces, requirements, reserves, findings. Its ACs are what "done" means; they need no tagged tests and get no reviewer. It is still generated; it costs nothing and keeps one code path.

Interface links resolve like OKF links: from the bolt doc's folder, or from the docs bundle root when they start with `/`. The card shows repo paths.
