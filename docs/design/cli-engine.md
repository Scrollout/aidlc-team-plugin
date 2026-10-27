---
type: Design
title: CLI engine
description: How the CLI's command handlers and hook rules return data for adapters to render, and the limits the CLI is built within.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T10:28:02Z }
---

# Engine and adapters
- Every command handler returns `{ code, findings: [{ code, path, line, message, fix }], output }`. A hook rule returns the decision JSON its hook prints, as the `output` of the `hook` command. Handlers never print, write stdout or exit.
- `aidlc.mjs` and `hook <name>` are adapters that render this data as the output and exit codes of the [CLI](cli.md). MCP, HTTP-hook and A2A adapters can reuse the same functions later; owner-only commands are never exposed on them ([0006](../decisions/0006-engine-behind-adapters.md)).

# Implementation limits
- Node 22+, ESM, no dependencies; git through `execFileSync`, never a shell. Project commands from the profile run through the shell.
- `plugin/cli/lib/` one module per concern: `config`, `profile`, `template`, `okf`, `grid`, `state`, `card`, `gate`, `hooks`, `init`, `board`, `retro`, `deploy`.
- Values and messages live in `cli.json` ([CLI](cli.md#values)).
- Every module is tested with `node:test` against fixture repos created in a temp dir.

# Output
- Paths in output, cards and runtime files are relative and use `/` on every platform; the CLI resolves its working folder to its real long path first (Windows short names, symlinks), and reads docs with CRLF line ends as LF.
- Findings: `path:line CODE message → fix (level)`, one per line, with the level as run (`docs.rules` and adoption change it). Codes are stable.
- Advice: one line, imperative, naming the command or agent to run.
- No banners, no colour unless a TTY, no summaries longer than the findings.

# Values
No hand-coded values in code. Commands, exit codes, file paths, layer order and every user-facing message live in `plugin/cli/cli.json`, read by `config`. Messages are templates rendered by the template engine. `cli.json` sits beside the CLI so it is vendored with it. Tests check that its commands and exit codes match this doc.
