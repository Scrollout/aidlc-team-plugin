---
type: Design
title: Board on Jira
description: The board's one-way projection onto a Jira project through acli, which owns the login - the same template, items and status map as on GitHub, written by deterministic code at zero model tokens.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-29T12:00:00Z }
---

# Why
A team that plans in Jira sees the plan where it works, with the guarantees of the [Board](board.md): a sensor, one way, from derived state, and never read by a decision.

# Cost
Zero AI model tokens: `aidlc sync` calls `acli jira workitem` and parses its `--json` answers. Atlassian's CLI owns the login (`acli auth login`), as `gh` does on GitHub; the plugin never reads or stores a token.

# Shape
- Off unless the profile has a `jira` section: `{ "site": "<host>", "project": "<KEY>" }`, with an optional `board` id. `site` and `board` say where people find the board; acli's login decides the site it writes to. `jira.acli` names another acli, as a path or a command list, usually in the personal layer.
- **The items** are the board's: which docs, with which title, body, labels, status, parent and blockers, rendered from `board.json` and the project's `.aidlc/templates/board.json`, with the template's `jira` map merged over its kinds and fields. Shipped, an intent is an `Epic`, a bolt a `Story` under its intent's Epic, and a fix, a bolt with no intent, a `Task`. The profile's `jira.types` and `jira.status` apply over it, as `github.types` and `github.status` do.
- **Labels** as on GitHub (`slice:<name>`, `layer:<kind>`, `ADR-<NNNN>`, requirements, lane, modules), plus the marker. Jira's label rule, no white space, is data (`jira.label`, a pattern and its replacement). Labels the plugin set and the plan no longer gives are removed; ones people add stay.
- **Body** from `workitem.md` (`.aidlc/templates/workitem.md` overrides it): the description, the ACs, the slices and the doc's link, without the HTML marker. It is sent as ADF: each AC a task item, done once merged, each other `- ` line a bullet, any other line a paragraph. Read back, the description is compared as text, line by line.
- **Status**: the template's `Status` map from the derived state (`building` → In Progress, `merged` → Done, a held bolt To Do); sync transitions an item whose status differs.
- **Blocks**: each of a bolt's `depends` is a "Blocks" link from the dependency's item (outward) to the bolt's (inward). Links are added to match the plan; one the plan drops stays for people to remove, as acli's link command only creates.
- Type and parent are set when the item is created.
- The doc's link points at GitHub when `jira.repo` or `github.repo` is set, else it is the doc's path.
- Not projected: Project fields, milestones and assignees, which are GitHub's.

# Finding the item
- `board.issue` in the doc, when it is a Jira key (`jira.key`), names the item: sync edits it and adds the marker.
- Otherwise its marker label (`jira.marker`: `aidlc-I-1`, `aidlc-B-3`) finds it; with several, the oldest key wins.
- Neither: sync searches once more, as Jira's search can lag, and creates only what is still missing.
- One paginated search reads every marked item with the fields sync compares (`jira.jql`, `jira.fields`); a named item it does not return is viewed.

# Writes
Read first, then write only differences, so a second sync with nothing changed makes no write:

```
acli jira workitem search --jql 'project = "KAN" AND labels in ("aidlc-I-1", …)' --limit 100 --paginate --json --fields summary,status,labels,parent,issuetype,description,issuelinks
acli jira workitem create --project KAN --type Story --summary S --description-file F --label a,b --parent KAN-1 --json
acli jira workitem edit --key KAN-2 --summary S --description-file F --labels a,b --remove-labels c --yes --json
acli jira workitem transition --key KAN-2 --status "In Progress" --yes --json
acli jira workitem link create --out KAN-2 --in KAN-3 --type Blocks --yes
```

A created item is viewed once (`view KAN-2 --json`) for its status.

# When
- `aidlc sync` syncs each board the profile sets, GitHub, Jira or both; `merge` runs it afterwards, and a failure is a warning, never a merge failure. Not in hooks or CI, as on GitHub.
- A board behind the plan: sync records a hash of the items it wanted in `.git/aidlc/jira.json`, beside GitHub's `.git/aidlc/board.json`; `next` and `status` add `the board is behind: aidlc sync` when either differs from the plan's.
- No inbound path: `fix --from-issue` reads GitHub issues.

# Structure
The board extension keeps the derivation and serves it for either key through the `boardItems` seam: a tracker's items, their hash and its state file. The `jira` extension writes them through acli, and plugs `boardSync`, which the board's `sync` command calls, and `afterMerge`. Neither imports the other ([Library](library.md#seams)), and each plug counts only when the profile has its section. The two transports share nothing but the items, so each stays in its extension.
- A section kept for something else, such as `github.repo` for CI, sets `board: false`, and that board stays off.
