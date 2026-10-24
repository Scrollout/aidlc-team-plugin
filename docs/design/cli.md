---
type: Design
title: CLI
description: The aidlc commands, their exit codes and the terse output format.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T15:45:00Z }
---

# Commands
| Command | Does | Run by |
|---|---|---|
| `init [--run <level>=<command>]…` | asks questions, writes profile with each level's run command, renders templates, vendors itself | owner via the `aidlc` skill |
| `upgrade [--downgrade] [--dirty]` | re-vendors the CLI from the installed plugin's release; refuses an older one or a checkout with uncommitted changes unless told; says when nothing changed, which release it copied, and how to fetch a newer one | owner |
| `index [bundle]` | regenerates every `index.md` in the bundle like the OKF reference implementation | docs hook, merge, anyone |
| `check [--ci] [path…]` | OKF validation, plan lint, profile lint; `--ci` adds merge-trailer checks. A directory is checked as a bundle, or within the profile's bundle when it lies below its root; a file reports only its own findings | hooks, CI, anyone |
| `status` | the state table | SessionStart hook, anyone |
| `next` | the single next action | lead |
| `lane <unit>|--diff <range>` | the computed lane and why | lead, gate |
| `card <unit>` | renders the unit card | lead |
| `start <unit>` | in a builder's worktree: names the branch `unit/U-<n>`, checks the base matches the card, and merges the card's base into an existing branch | builder |
| `delegate <class>…\|off` | lets the lead approve re-approvals and quick-lane units ([0008](../decisions/0008-delegated-approvals.md)) | owner (prompt or `!`) |
| `mode attended\|unattended [--stop <action>] [--report <to>]\|off` | records the owner's run mode in the personal profile: unattended or not, the `next` action to stop at (`build`, `review`, `fix`, `merge`, `release`), where to report | owner (prompt or `!`) |
| `approve [--auto] <doc>` | stamps approval | owner (`!`); `--auto` the lead, for what the owner delegated ([0008](../decisions/0008-delegated-approvals.md)) |
| `review record <unit> <file\|->` | stores a reviewer verdict keyed by diff hash; `-` reads it from stdin | reviewer |
| `report <unit>` | stores the builder's report (JSON on stdin) | builder |
| `hold <unit> [off or <reason>]` / `priority <unit> <n>` | records an owner instruction in the plan (`hold: true` or the reason, `priority: <n>`, higher first); the lead also holds a unit with a reason while it parks a question for the owner | lead |
| `fix "<title>"\|--from-issue <n> [--after <intent>]` | one-unit plan without an intent; from an issue, titled like it and linked to it; `--after` links the release it fixes; prints the plan lint findings of the unit it wrote | lead |
| `sync` | projects intents and units onto GitHub issues and a Project ([Board](board.md)) | lead, merge |
| `push` | checked base push | lead |
| `merge <unit>` | the merge gate, then `git merge --no-ff` with trailers | lead |
| `deploy check <intent>` | runs `deploy.check` on the base and records it ([Deployment and operation](operations.md)) | lead |
| `release <intent>` | runs `deploy.run` and `release` on the base and records them | owner (prompt or the words `release I-<n>`) |
| `rollback <intent>` | runs `deploy.rollback` and records it | owner (prompt or the words `rollback I-<n>`) |
| `research <doc>` | prints the researcher's brief for a question held on the doc: the question, the project's docs, stack files and `research.sources`, the budget, and where the digest goes ([0010](../decisions/0010-research-and-advice.md)) | lead |
| `retro <intent>` | lists the codes that fired 3+ times, the intent's escalations and the owner's interventions, proposes at most three changes, and resets the counters ([Steering](steering.md#3-across-intents-the-retro)) | lead, owner |
| `hook <name>` | entry point for the plugin's hooks; reads the hook JSON on stdin | hooks |

# Output
- Paths in output, cards and runtime files are relative and use `/` on every platform; the CLI resolves its working folder to its real long path first (Windows short names, symlinks), and reads docs with CRLF line ends as LF.
- Findings: `path:line CODE message`, one per line. Codes are stable (`OKF-TYPE`, `PLAN-DAG`, `SCOPE-OUT`, …).
- Advice: one line, imperative, naming the command or agent to run.
- No banners, no colour unless a TTY, no summaries longer than the findings.

# Engine and adapters
- Every command handler returns `{ code, findings: [{ code, path, line, message, fix }], output }` and every hook rule returns `{ decision, code, message, fix }`. Handlers never print, write stdout or exit.
- `aidlc.mjs` and `hook <name>` are adapters that render this data as the output and exit codes below. MCP, HTTP-hook and A2A adapters can reuse the same functions later; owner-only commands are never exposed on them ([0006](../decisions/0006-engine-behind-adapters.md)).

# Exit codes
`0` ok · `1` findings · `2` blocked by a human gate · `64` bad usage · `70` internal error (hooks treat it as deny).

# Implementation limits
- Node 22+, ESM, no dependencies; git through `execFileSync`, never a shell.
- `plugin/cli/lib/` one module per concern: `config`, `profile`, `template`, `okf`, `grid`, `state`, `card`, `gate`, `hooks`, `init`, `board`, `retro`.
- No hand-coded values in code. Commands, exit codes, file paths, layer order and every user-facing message live in `plugin/cli/cli.json`, read by `config`. Messages are templates rendered by the template engine. `cli.json` sits beside the CLI so it is vendored with it. Tests check that it matches this doc.

- Every module is tested with `node:test` against fixture repos created in a temp dir.
