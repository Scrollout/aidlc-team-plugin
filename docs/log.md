---
type: Log
title: aidlc-team-plugin docs history
---

# Bundle history

## 2026-10-22

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
