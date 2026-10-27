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
- Off unless the profile has a `github` section: `{ "repo": "owner/name", "project": "orgs/owner/projects/<n>" }`. `project` is optional; without it only issues are synced.
- **The template.** `plugin/cli/extensions/board/board.json`, with a project's `.aidlc/templates/board.json` merged over it, describes the board ([Values as data](values.md#the-board-as-a-template)). Each item kind (`intent`, `unit` for a bolt, `fix` for a bolt with no intent) names its title template, body template, labels and assignees as paths into the doc's values, its issue type, its milestone (its own, or its parent's), its parent and its `blockedBy` path. `fields` names each Project field with its `type` (`SINGLE_SELECT` with `options`, `NUMBER`, `DATE`, `TEXT`, `ITERATION` with `start` and `duration`), the path its value comes `from` and a value `map`. The profile's `github` maps (`fields`, `status`, `types`, `assignees`) apply over it.
- A doc's values: its front matter, with its id, title, requirements, lane, modules, depends and status; `board.wave` (1 + the highest wave among the bolt's dependencies in its intent) and `board.binding` are derived, and a value in the doc wins.
- Intents are `I-<n> <title>` issues, their bolts sub-issues. A bolt's `depends` are blocked-by links, added and removed to match the plan; links to issues off the board stay. Labels and assignees the plugin set and the plan no longer gives are removed; ones people add stay. Assignees: the doc's `board.assignees`, else `github.assignees`, else the `gh` user. Milestone: one per intent, due on its `board.target`. The type is set where the repository supports types (organisation repositories).
- Bodies come from `issue.md` (`.aidlc/templates/issue.md` overrides it): the description, the ACs as a checklist (ticked once merged), a link to the doc at the base, and the marker. Over 1,500 chars, ACs are dropped from the end.
- Status: the template's `Status` map from the derived state (`building` → In Progress, `reviewing` → In review, `merged` → Done, and so on). A held `approved` or `blocked` bolt is On hold; an approved intent with a bolt past approval is `started`, In Progress.
- **Before any write**, `sync` reads the Project and refuses a field of the wrong type, a missing field the template gives no type, and a value that is neither an option the Project has nor one the template declares. It then creates a missing field or declared option, and writes an iteration by its title or start date. The options are kept in `.git/aidlc/board.json` for plan lint.
- Planned values: when `github` is set, plan lint (`PLAN-BOARD`) requires each live bolt to carry every path `github.fields` maps, except the derived ones, with an example from the profile's own map, and flags a value the kept options lack.
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
