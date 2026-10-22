---
type: Log
title: aidlc-team-plugin docs history
---

# Bundle history

## 2026-10-22

- **Update** U3 built: plan lint (`PLAN-*`) runs in `aidlc check`, and `aidlc lane` computes lanes. A glob with a leading `/` is anchored at the root ([Grid](design/grid.md)). Release 0.3.0 ships the MIT license in `plugin/`.
- **Update** The repo is public and name neutral. The docs no longer name private projects or tools, and the marketplace is renamed to `aidlc-team` ([Overview](design/overview.md)).
- **Update** U3 settled with the owner ([Grid](design/grid.md), [Profile and templates](design/profile.md)):
  - The unit doc format.
  - The PLAN codes, and that plan lint covers all live units, with merged ones skipped by U4.
  - `profile.levels`.
  - Glob and lane rules.
- **Update** U2 built: [OKF](design/okf.md) now records the YAML subset, rule levels including `off`, and the exact subdirectory-description and listing behaviour of the index generator. Indexes were regenerated, so one-entry folders now show their entry's description, as in the reference.
- **Update** Each release gets both `v<version>` and `aidlc-team--v<version>` tags, and `plugin/` may not change without a version bump ([Overview](design/overview.md)).
- **Update** Versions are released as git tags `aidlc-team--v<version>`, made with `claude plugin tag`. CI checks that a tag matches `plugin.json` ([Overview](design/overview.md)).
- **Creation** [0006 Engine behind adapters](decisions/0006-engine-behind-adapters.md): command handlers and hook rules return data, so MCP, HTTP hooks and A2A can be added later. Owner actions stay off agent-facing adapters. [CLI](design/cli.md) and [Verification](design/verification.md) updated to match.
- **Update** No hand-coded values in the CLI. Commands, exit codes, paths, layers and messages now live in `plugin/cli/cli.json`, read by a new `config` module ([CLI](design/cli.md), [M1](roadmap/m1.md)).
- **Update** Settled the open points of U1 with the owner:
  - The plugin is `aidlc-team` in the `aidlc-team` marketplace ([Overview](design/overview.md)).
  - `deny` arrays at any depth are unions across layers, and the personal layer is `.aidlc/local/profile.json` ([Profile and templates](design/profile.md)).
  - `#each` scoping and template errors are defined ([Profile and templates](design/profile.md)).
  - Tests run with `node --test` (no argument): from Node 22 on, `node --test tests/` loads the directory as a module and fails.
  - U1 scope adds `tests/cli*` for the CLI tests. CI runs `check docs` from U1 on; until U2 builds it, the command exits 70 and that step stays red ([M1](roadmap/m1.md)).

- **Update** Corrected the design against the official Claude Code docs:
  - Hooks fail open by default, so blocking hooks now set `onFailure: "block"` and an explicit timeout ([Verification](design/verification.md)).
  - Builders branch from the remote default branch unless `worktree.baseRef: "head"` is set ([Team](design/team.md)).
  - Builders and reviewers set `omitClaudeMd`.
  - The CLI moved to `plugin/cli/`, because claude.ai and Cowork refuse plugins with a top-level `bin/`.
  - [OKF](design/okf.md) now records that no official validator tool exists.

- **Update** Aligned the bundle with the official OKF repository (spec, reference implementation, sample bundles). Indexes are now generated per directory, grouped by `type`, like the reference `index.py`. Bodies use top-level `#` sections, and the TL;DR lines are gone. [OKF](design/okf.md) is rewritten to cite the official sources.
- **Update** Checked the Claude Code assumptions against the official hooks, subagents and plugin-marketplace docs. Changed [Team](design/team.md), [Verification](design/verification.md), [Steering](design/steering.md), [CLI](design/cli.md) and [M1](roadmap/m1.md).
- **Update** [State](design/state.md) now covers surviving a clear or crash. Added test levels and proof-revert to [Grid](design/grid.md) and [Verification](design/verification.md), and model routing to [Team](design/team.md).
- **Creation** [Everyday paths](design/paths.md) and [Steering](design/steering.md). Security coverage added to [Team](design/team.md) and [Verification](design/verification.md).
- **Creation** [Principles](constitution/principles.md), the design set, decisions 0001-0005 and the [M1 plan](roadmap/m1.md). They draw on the review of a previous workflow tool, a pilot project, AWS aidlc-workflows and the AI-DLC video series.
