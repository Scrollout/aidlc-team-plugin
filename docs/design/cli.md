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
| `index` | regenerates every `index.md` in the bundle like the OKF reference implementation | docs hook, merge, anyone |
| `check [--ci] [--staged] [path…]` | OKF validation, plan lint, profile lint; `--ci` adds merge-trailer checks | hooks, CI, anyone |
| `status` | the state table | SessionStart hook, anyone |
| `next` | the single next action | lead |
| `lane <unit>|--diff <range>` | the computed lane and why | lead, gate |
| `card <unit>` | renders the unit card | lead |
| `start <unit>` | in a builder's worktree: names the branch `unit/U-<n>`, checks the base matches the card | builder |
| `reserve <kind> <area>` | next free number for a reservation, checked against the plan and the base | lead while planning |
| `approve <doc>` | stamps approval | owner only (`!`) |
| `review record <unit> <file>` | stores a reviewer verdict keyed by diff hash | reviewer |
| `report <unit>` | stores the builder's report (JSON on stdin) | builder |
| `hold <unit>` / `priority <unit> <n>` | records an owner instruction in the plan | lead, on the owner's word |
| `fix "<title>"` | one-unit plan without an intent | lead |
| `push` / `clean` | checked base push; removes orphan worktrees and branches | lead |
| `merge <unit>` | the merge gate, then `git merge --no-ff` with trailers | lead |
| `hook <name>` | entry point for the plugin's hooks; reads the hook JSON on stdin | hooks |

# Output
- Findings: `path:line CODE message`, one per line. Codes are stable (`OKF-TYPE`, `PLAN-DAG`, `SCOPE-OUT`, …).
- Advice: one line, imperative, naming the command or agent to run.
- No banners, no colour unless a TTY, no summaries longer than the findings.

# Exit codes
`0` ok · `1` findings · `2` blocked by a human gate · `64` bad usage · `70` internal error (hooks treat it as deny).

# Implementation limits
- Node 20+, ESM, no dependencies; git through `execFileSync`, never a shell.
- `plugin/cli/lib/` one module per concern: `profile`, `template`, `okf`, `grid`, `state`, `card`, `gate`, `hooks`, `init`.
- Every module is tested with `node:test` against fixture repos created in a temp dir.
