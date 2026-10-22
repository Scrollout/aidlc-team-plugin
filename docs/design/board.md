---
type: Design
title: Board
description: An optional one-way projection of derived state onto GitHub issues and a GitHub Project, written by deterministic code at zero model tokens.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T11:30:00Z }
---

# Why
Owners and teams watch work on a board. The board is a sensor, not a source of truth: progress stays derived from git and the docs (principle 2), and nothing the plugin decides reads the board, so it cannot become a second ledger that drifts.

# Cost
Zero model tokens. `aidlc sync` is CLI code calling `gh api graphql`; issue titles, bodies and fields come from templates filled with doc fields. No agent writes or reads issues, and there is no scrum-master agent: `next` and `status` already do that job deterministically. Bodies stay short: the doc's description, the AC lines as a checklist, and a link to the doc.

# Shape
- Off unless the profile has a `github` section: `{ "repo": "owner/name", "project": "orgs/owner/projects/<n>", "status": { … }, "fields": { … } }`.
- One issue per intent, its units as sub-issues (Parent issue, Sub-issues progress); requirements as labels `R-<n>`.
- Status from the derived state through `github.status`, e.g. `draft`, `approved` → Todo; `building`, `fix` → In Progress; `reported`, `reviewed` → In review; `blocked`, `escalated`, held → On hold; `merged` → Done.
- Other fields from frontmatter through `github.fields`, e.g. `{ "Priority": "priority", "Effort": "effort", "Start date": "start", "Target date": "target", "Track": "track" }`; labels from lane, modules and focus; an intent can map to a milestone.
- Issues are found by a neutral marker in their body (`unit: U-3`), so no issue numbers are stored. The merge gate adds `Closes #<n>` to the merge commit, so pushing the base closes the issue.

# When
- After `aidlc merge`, and on demand (`aidlc sync`), with the owner's `gh` login. Not in hooks (network, time limits); not in CI by default, because CI's token cannot write organisation projects.
- The only inbound path: `aidlc fix --from-issue <n>` turns an issue into a fix unit. Priority and holds are set with `aidlc priority` and `aidlc hold`, never from the board.
