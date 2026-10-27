---
type: Design
title: Board
description: An optional one-way projection of derived state onto GitHub issues and a GitHub Project, written by deterministic code at zero model tokens.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T11:30:00Z }
---

# Why
The board is a sensor, not a source of truth: progress stays derived from git and the docs (principle 2), and nothing the plugin decides reads the board, so it cannot become a second ledger that drifts.

# Cost
Zero model tokens. `aidlc sync` is CLI code calling `gh api` (REST for issues, GraphQL for the Project); issue titles, bodies and fields come from templates filled with doc fields. No agent writes or reads issues; `next` and `status` do a scrum master's job deterministically. Bodies stay short.

# Shape
- Off unless the profile has a `github` section: `{ "repo": "owner/name", "project": "orgs/owner/projects/<n>", "status": { … }, "fields": { … } }`. `project` is optional; without it only issues are synced.
- One issue per intent, titled `I-<n> <title>`, its bolts as sub-issues titled `B-<n> <title>` (Parent issue, Sub-issues progress). Labels: the cited requirements (`R-<n>`), and for a bolt its lane and modules. `sync` creates a missing label and only ever adds labels, so labels people add stay.
- Bodies come from `plugin/cli/issue.md`, beside the CLI like the card so a pinned copy carries it; `.aidlc/templates/issue.md` overrides it. It holds the description, the ACs as a checklist (ticked once merged), a link to the doc at the base, and the marker. Over 1,500 chars, ACs are dropped from the end.
- Status from the derived state through `github.status`, over the board extension's defaults (`plugin/cli/extensions/board/extension.json`): `draft`, `approved`, `stale`, `blocked` → Todo; `building`, `fix` → In Progress; `reported`, `reviewing`, `reviewed`, `gated` → In review; `escalated`, `stopped`, and a held `approved` or `blocked` bolt → On hold; `merged`, `released` → Done. An approved intent with a bolt past approval is `started` → In Progress.
- Other fields from frontmatter through `github.fields`: a field name maps to a frontmatter path, or to `{ "from": <path>, "map": { <value>: <option> } }`, e.g. `{ "Priority": { "from": "priority", "map": { "2": "P0" } }, "Effort": "board.effort" }`. Single-select values are option names. A field the doc does not set is left alone. `sync` checks every value against the Project's options before any write and keeps them in `.git/aidlc/board.json`; plan lint flags a value they lack.
- Planned values: when `github` is set, plan lint (`PLAN-BOARD`) requires each live bolt to carry every frontmatter path `github.fields` maps, except the derived `board.wave`, e.g. `priority` and `board: { effort, track, start, target }`. The lead writes them while drafting; the owner approves them with the plan. The finding gives a frontmatter example from the profile's own map.
- Derived values: `board.wave` defaults to 1 + the highest wave among the bolt's dependencies in its intent, so bolts that can build together share a wave; a value in the doc wins.
- Assignees: `github.assignees`, or the `gh` user who runs `sync`; added, never removed. Milestone: one per intent, titled `I-<n> <title>`, due on the intent's `board.target`; the intent and its bolts join it.
- Type: `github.types` (default intent → Feature, bolt → Task, bolt without intent → Bug) sets the issue type where the repository supports types (organisation repositories) and is skipped elsewhere.
- Board data lives in a frontmatter map `board:` (e.g. `board: { issue: 12, effort: M, target: 2026-11-30 }`), which the approval hash excludes like `priority` and `hold`, so planning edits never make a doc stale.

# Finding the issue
- `board.issue` in the doc names the issue. Adopted projects link their existing issues this way, and `fix --from-issue` writes it.
- Otherwise the marker in the body (`<!-- unit: B-3 -->`, `<!-- intent: I-1 -->`) finds it; with several, the oldest wins. No issue number is stored anywhere else.
- Neither: `sync` lists the issues once more, since GitHub's list can lag, and creates the issue only if it is still missing.
- A list shorter than the repository's issue count (GraphQL `issues.totalCount`) is a lagging read: `sync` lists again after each wait in the profile's `board.backoff` (ms; by default 500, 1000, 2000 and 4000), and when it is still short it stops before creating anything, a label or milestone included.
- A Project's auto-add of sub-issues can add an item after `sync` read them; the add then fails (`Content already exists`). `sync` reads the items again with `board.backoff`; one still unlisted (archived) stops it, naming the issue.

# Closing
`sync` closes the issue of a merged bolt and of a merged or released intent, and reopens one that is no longer done. `merge` stays offline: with `profile.github` set it runs `sync` afterwards, and a sync failure is a warning, never a merge failure. No `Closes` trailer is written.

# When
- After `aidlc merge`, and on demand (`aidlc sync`), with the owner's `gh` login. `github.gh` names another `gh`, as a path or a command list, usually in the personal layer. Not in hooks (network, time limits); not in CI by default, because CI's token cannot write organisation projects.
- A board behind the plan: `sync` records a hash of the issues it wants in `.git/aidlc/board.json`. When an approval, start, report or hold changes them, `next` and `status` add `the board is behind: aidlc sync`, the lead's step.
- A second `sync` with nothing changed makes no write: it reads the issues, sub-issues and project items first and writes only differences.
- The only inbound path: `aidlc fix --from-issue <n> --scope <glob>` turns an issue into a fix bolt titled like the issue, with `board: { issue: <n> }`. Priority and holds are set with `aidlc priority` and `aidlc hold`, never from the board.
