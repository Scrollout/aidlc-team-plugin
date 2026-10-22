---
type: Design
title: CLI
description: The aidlc commands, their exit codes and the terse output format.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Commands
| Command | Does | Run by |
|---|---|---|
| `init` | asks questions, writes profile, renders templates, vendors itself | owner via the `aidlc` skill |
| `upgrade` | re-vendors the CLI from the installed plugin | owner |
| `index [bundle]` | regenerates every `index.md` in the bundle like the OKF reference implementation | docs hook, merge, anyone |
| `check [--ci] [--staged] [path…]` | OKF validation, plan lint, profile lint; `--ci` adds merge-trailer checks. A directory is checked as a bundle; a file reports only its own findings | hooks, CI, anyone |
| `status` | the state table | SessionStart hook, anyone |
| `next` | the single next action | lead |
| `lane <unit>|--diff <range>` | the computed lane and why | lead, gate |
| `card <unit>` | renders the unit card | lead |
| `start <unit>` | in a builder's worktree: names the branch `unit/U-<n>`, checks the base matches the card | builder |
| `reserve <kind> <area>` | next free number for a reservation, checked against the plan and the base | lead while planning |
| `approve <doc>` | stamps approval | owner only (`!`) |
| `review record <unit> <file\|->` | stores a reviewer verdict keyed by diff hash; `-` reads it from stdin | reviewer |
| `report <unit>` | stores the builder's report (JSON on stdin) | builder |
| `hold <unit>` / `priority <unit> <n>` | records an owner instruction in the plan | lead, on the owner's word |
| `fix "<title>"\|--from-issue <n>` | one-unit plan without an intent; from an issue, titled like it and linked to it | lead |
| `sync` | projects intents and units onto GitHub issues and a Project ([Board](board.md)) | lead, merge |
| `push` / `clean` | checked base push; removes orphan worktrees and branches | lead |
| `merge <unit>` | the merge gate, then `git merge --no-ff` with trailers | lead |
| `hook <name>` | entry point for the plugin's hooks; reads the hook JSON on stdin | hooks |

# Output
- Findings: `path:line CODE message`, one per line. Codes are stable (`OKF-TYPE`, `PLAN-DAG`, `SCOPE-OUT`, …).
- Advice: one line, imperative, naming the command or agent to run.
- No banners, no colour unless a TTY, no summaries longer than the findings.

# Engine and adapters
- Every command handler returns `{ code, findings: [{ code, path, line, message, fix }], output }` and every hook rule returns `{ decision, code, message, fix }`. Handlers never print, write stdout or exit.
- `aidlc.mjs` and `hook <name>` are adapters that render this data as the output and exit codes below. MCP, HTTP-hook and A2A adapters can reuse the same functions later; owner-only commands are never exposed on them ([0006](../decisions/0006-engine-behind-adapters.md)).

# Exit codes
`0` ok · `1` findings · `2` blocked by a human gate · `64` bad usage · `70` internal error (hooks treat it as deny).

# Implementation limits
- Node 20+, ESM, no dependencies; git through `execFileSync`, never a shell.
- `plugin/cli/lib/` one module per concern: `config`, `profile`, `template`, `okf`, `grid`, `state`, `card`, `gate`, `hooks`, `init`, `board`.
- No hand-coded values in code. Commands, exit codes, file paths, layer order and every user-facing message live in `plugin/cli/cli.json`, read by `config`. Messages are templates rendered by the template engine. `cli.json` sits beside the CLI so it is vendored with it. Tests check that it matches this doc.

- Every module is tested with `node:test` against fixture repos created in a temp dir.
