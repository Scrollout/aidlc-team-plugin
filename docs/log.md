# Log

## 2026-10-22
* **Update**: Checked the Claude Code assumptions against the official hooks, subagents and plugin-marketplace docs. [Team](design/team.md) now names the builder branch with `aidlc start`, forbids nested subagents, and keeps enforcement out of plugin-agent frontmatter. [Verification](design/verification.md) now fails closed explicitly, adds a model hook on the `Agent` tool, and cites its sources. [Steering](design/steering.md) uses the documented Stop-hook fields. [CLI](design/cli.md) and [M1](roadmap/m1.md) follow.
* **Update**: Aligned the bundle with the official OKF v0.2 spec. Added a per-folder index for constitution, design, decisions and roadmap (house rule); rewrote [OKF](design/okf.md) to separate spec conformance from house rules; approvals now use the spec's `verified` field ([State](design/state.md)); every doc carries `generated`.
* **Update** [Grid](design/grid.md) with test levels per AC; [Verification](design/verification.md) and [M1](roadmap/m1.md) with proof-revert in the full lane and CI for this repo.
* **Update** [State](design/state.md) with surviving a clear or crash; [Verification](design/verification.md), [CLI](design/cli.md) and [M1](roadmap/m1.md) to match.
* **Creation** [Everyday paths](design/paths.md); **Update** [Verification](design/verification.md) with prompt evals and [M1](roadmap/m1.md) with their acceptance criteria.
* **Creation** [Steering](design/steering.md); **Update** [Verification](design/verification.md), [Team](design/team.md), [Profile](design/profile.md) and [M1](roadmap/m1.md) for security coverage and self-correction; model routing added to [Team](design/team.md) and the card.
* **Creation** [Principles](constitution/principles.md), the design set under `design/`, decisions 0001-0004 and the [M1 plan](roadmap/m1.md), from the review of a previous tool, a pilot project, AWS aidlc-workflows and the AI-DLC video series.
