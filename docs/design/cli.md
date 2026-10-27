---
type: Design
title: CLI
description: The aidlc commands, their exit codes and the terse output format.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T15:45:00Z }
---

# Commands
| Command | Does | Run by |
|---|---|---|
| `init [--adopt] [--name n] [--base b] [--bundle dir] [--run level=command]… [--overwrite path]… [--system-code c] [--org o] [--zone z]` | writes a v2 profile, templates and the pinned CLI; `--adopt` keeps a bundle ([Profile and templates](profile.md)) | owner via the skill |
| `upgrade [--downgrade] [--dirty]` | re-vendors the CLI from the installed plugin and adds missing templates; refuses an older release or uncommitted changes unless told; names the release | owner (prompt or `!`) |
| `index [bundle]` | regenerates every `index.md` in the bundle, as OKF's reference does | docs hook, merge, anyone |
| `check [--ci] [path…]` | OKF validation, plan lint, profile lint; `--ci` adds the base history and architecture checks. A directory is checked as a bundle (or within the profile's bundle below its root), a file for its own findings | hooks, CI, anyone |
| `status` | the state table | SessionStart hook, anyone |
| `next` | the single next action | lead |
| `lane <bolt>\|--diff <range>` | the computed lane and why | lead, gate |
| `card <bolt>` | renders the bolt card | lead |
| `start <bolt>` | in a builder's worktree: names the branch `bolt/B-<n>`, checks the base matches the card, and merges the card's base into an existing branch | builder |
| `approve [--auto] <doc>…` | stamps approval; a doc is a path, an ID (`B-3`, `I-1`, `R-12`) or a decision's number (`0010` or `10`) | owner (typed words, prompt or `!`); `--auto` the lead, for what the owner delegated ([0008](../decisions/0008-delegated-approvals.md)) |
| `delegate <class>…\|off [--until <date>]` | lets the lead approve re-approvals and quick-lane bolts, or run `upgrade` ([0008](../decisions/0008-delegated-approvals.md)) | owner (prompt or `!`) |
| `mode attended\|unattended [--stop <action>] [--report <to>]\|off` | records the owner's run mode in the personal profile: unattended or not, the `next` action to stop at, where to report | owner (prompt or `!`) |
| `research <doc>` | prints the researcher's brief for the doc's held question ([0010](../decisions/0010-research-for-open-questions.md)) | lead |
| `review I-<n>\|record <bolt\|intent> <file\|->` | prints an intent reviewer's brief; `record` stores a verdict (by diff hash) or an intent review (by its docs' hash, [Intake](intake.md)); `-` reads stdin | lead, reviewer |
| `report <bolt> [file]` | stores the builder's report (JSON from the file, or stdin) | builder |
| `hold <doc> [off\|<reason>]` | records an owner hold in the plan: `hold: true` or a reason; `off` removes it. The lead also holds a doc while it parks a question, and a merged intent to park its release | lead |
| `priority <bolt> <n>` | records `priority: <n>` in the plan, higher first | lead |
| `name <kind> [--<flag> <value>]…` | a name from the grammar and registry; the flags each kind needs are in `cli.json` ([Naming](naming.md)) | lead, builder |
| `persona <role>` | prints a role persona and its knowledge ([Intake](intake.md)) | lead |
| `new bolt "<title>"` | a draft `B-<n>`, named from its title | lead |
| `fact "<title>" --env <environment> -- <command>` | runs a read-only probe on the target and records its output as a platform fact ([Inception](inception.md)) | lead |
| `dispose <I-n\|B-n> F-<k> fixed\|accepted "<reason>" [--until <date>]` | records the owner's disposition of a review finding | owner (prompt) |
| `fix "<title>"\|--from-issue <n> --scope <glob>… [--requirement R-<n>…] [--after <intent>]` | a fix (a bolt in a v2 project) without an intent; from an issue, titled and linked like it; `--after` links the release it fixes; prints its plan lint findings ([Everyday paths](paths.md#fixes-without-an-intent)) | lead |
| `map` | writes the codebase map in the bundle ([Codebase map](codebase-map.md)) | lead, merge |
| `push` | a checked base push | lead |
| `ci wait` | waits for the pushed base's GitHub Actions runs and records green, red, pending or none ([CI on the base](base-ci.md)) | lead |
| `merge <bolt>` | the merge gate, then `git merge --no-ff` with trailers | lead |
| `hook <name>` | entry point for the plugin's hooks; reads the hook JSON on stdin | hooks |

The extensions' commands (stack packs, board, operations, intake, models): [Extension commands](cli-extensions.md).

# Engine, output and values
How handlers return data, how output is shaped and where every value lives: [CLI engine](cli-engine.md).

# Exit codes
`0` ok · `1` findings · `2` blocked by a human gate · `64` bad usage · `70` internal error (hooks treat it as deny).
