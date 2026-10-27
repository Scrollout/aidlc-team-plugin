---
type: Design
title: Library and extensions
description: The CLI as a layered library (foundation kits, domains, a runtime) with a public entry, named seams the core declares, and opt-in extensions that plug into them, each layer and extension with its own budget.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T12:00:00Z }
---

# Why
The plugin holds every project to kinds, layers and one-way dependencies. Its own CLI was one folder of 21 modules with five import cycles and an 850-line hub ([0017](../decisions/0017-the-cli-is-a-library-with-extensions.md)).

# Layout
`plugin/cli/` is still what `init` and `upgrade` copy to `.aidlc/bin/` ([Vendoring](vendoring.md)), so hooks, CI and the pinned copy keep working. The stack packs' data stays in `plugin/packs/`.

| Layer | Folder | Modules |
|---|---|---|
| foundation | `lib/foundation/` | `data` (cli.json and extension data, values, paths), `git`, `text` (templates, messages, findings), `yaml`, `glob`, `profile`, `store` (`.git/aidlc` files), `seams` |
| domains | `lib/domains/` | `bundle`, `method`, `plan`, `inception`, `construction`, `approval`, `flow`, `review`, `card`, `gate`, `architecture`, `map`, `naming`, `operations`, `retro`, `setup`, `host` (the guard rails the coding agent's hooks call) |
| runtime | `aidlc.mjs`, `lib/index.mjs` | the command table and extension loader; the public entry, the core's published surface |
| extension | `extensions/<name>/` | `board` (the Project board), `contracts` (the API and event grammar), `intake` (the owner's request and its proposal), `operations` (deploy check, release, smoke, rollback and the retro), `stacks` (graph, scaffold and checks of the stack packs) |

# Rules
- A layer imports only its own layer and those below it: foundation nothing but kits, domains foundation and other domains' exports, the runtime the core.
- An adapter, in the model's sense, speaks to an outside system and depends only on foundation kits. The CLI's one, the board's GitHub transport, lives in its extension. The host's hook rules call domains, so they are a domain.
- A domain reaches another domain only through its exported functions. Seams, never imports, carry a call back up a dependency.
- The core never imports an extension. An extension imports `lib/index.mjs` only.
- No import cycles. A test gives each of the CLI's files a kind and runs `ARCH-KIND`, `ARCH-LAYER` and `ARCH-CYCLE` on its file graph, as `check` does on a project. An extension may use a domain's published surface, here `lib/index.mjs`.

# Seams
`foundation/seams` keeps a list per seam. A domain or an extension adds a function with `plug(<seam>, fn)` when it loads. A seam's caller gets only those whose extension the profile enables:
- `planRules`: plan lint rules (inception, construction, board).
- `docChecks`: findings for `check` (contracts, stacks).
- `gateChecks`: findings on the merge result (contracts, stacks).
- `statusLines`, `delivered`, `statusTail`: lines, the delivered requirements and the closing line `status` shows (construction, board).
- `cardSections`: sections a card adds (stacks).
- `proofPatterns`: compile-error patterns of the proof (stacks).
- `afterMerge`: work after a merge lands (board).
- `issueTitle`: the title of an issue `fix --from-issue` reads (board).
- `stack`: the stack pack a project's files match (stacks), for the intake proposal.

# Extensions
An extension is `extensions/<name>/extension.json` plus `index.mjs`:
- `when`: the profile key it serves (`github`, `naming`; none for the stacks, which detect a pack, for operations, whose commands read the profile's `deploy`, or for intake, which every project uses). A plug that acts only with it says so.
- `data`: its codes, messages, commands and values, merged into the core's data when the CLI starts, so `cli.json` keeps only the core's.
- `index.mjs`: plugs its functions into seams and exports its commands.
`data` merges into the core's data when `foundation/data` loads, and the runtime then imports every extension folder it finds, so a vendored copy carries them all. An extension's checks find nothing to report in a project that lacks what it serves.

# Library entry
`lib/index.mjs` loads the core and exports its public functions (`readPlan`, `lintPlan`, `readState`, `checkBundle`, …). Tools other than the CLI, and the tests, import from it.

# Budgets
At most 4,800 lines for the core (`aidlc.mjs` and `lib/`), and 400 for each extension ([Overview](overview.md#budgets-hard-limits)).

Bolts: [M20](../roadmap/m20.md) B202, B203, B204, B205, B206, B207.
