---
type: Log
title: aidlc-team-plugin docs history
---

# Bundle history

## 2026-10-22

- **Update** The card hash leaves out the base commit, so a base that moves for other units no longer makes a recorded review stale (pilot finding, [Unit card](design/unit-card.md)). Release 0.13.1.
- **Creation** [0009 Owner commands by permission prompt](decisions/0009-approval-prompt.md), asked for by the owner: the lead runs `aidlc approve`, `upgrade` or the new `delegate`, and the guard asks the owner with a yes/no permission prompt, which also works from the mobile app, where `!` commands do not run. A reviewer in flight now keeps a `reviewing` marker fresh, so `next` and steer wait for it instead of asking for the same review again (pilot finding). Release 0.13.0.
- **Update** Simpler and smaller, as the owner asked during the pilot:
  - cut from M1 to M2: proof-revert, security content patterns, and the never-built `reserve`, `clean` and `check --staged`;
  - an `except` decision covers only the edges it lists, and the gate reads boundaries from the merged tree ([Merge mechanics](design/gate.md), [Requirements and architecture checks](design/architecture.md));
  - a merge the gate refused is not offered again until the base or the diff changes ([State](design/state.md));
  - during the pilot, fixes ship in one release per pilot milestone instead of one per finding.
  Release 0.12.0.
- **Creation** [0008 Delegated approvals](decisions/0008-delegated-approvals.md), chosen by the owner during the pilot: the personal profile can delegate re-approvals and quick-lane units to the lead, which approves them with `aidlc approve --auto`, stamped `agent:auto`. Release 0.11.0 also blocks a unit whose dependencies are unmerged even when an earlier branch exists, and moves helpers shared by every module into `config`.
- **Update** `hold` now also holds a reviewed unit's merge, not only its build (pilot finding). Release 0.10.8.
- **Update** `steer` lets a turn end when any line of the last message ends with a question mark, so an owner question followed by its options no longer makes the lead loop (pilot finding, [Hook mechanics](design/hooks.md)). Release 0.10.7.
- **Update** A builder report with `status: stopped` now sends the unit back to the lead ("fix the unit doc, then ask the owner to re-approve it") instead of to review; after the re-approval the builder restarts (pilot finding, [State](design/state.md)). `hold` and `priority`, listed since U1 but never built, now write their frontmatter fields; `check` skips merged units in plan lint, as `next` does. Release 0.10.6.
- **Update** An escalated review now has a way out ([State](design/state.md)): when the owner re-approves the edited unit, the escalation counts as a fix round, the card lists its findings, and the two-round count restarts. Before, `next` stopped at "escalated" for good (pilot finding). Release 0.10.5.
- **Update** A failing `gh` call during `sync` now reports gh's own error, not just the command line (pilot finding). Release 0.10.4.
- **Update** Third pilot fixes ([Grid](design/grid.md)): plan lint `PLAN-SHARED` flags a scope naming a bundle index, a log or a shared file, which only merge writes; an empty unit diff no longer raises the lane at the gate; a test catches duplicate keys in `cli.json`. Release 0.10.3.
- **Update** Second pilot fixes ([Team](design/team.md), [OKF](design/okf.md)): a quick-lane unit gets no review, as designed, and merges with `Review: none`; `aidlc index` moves prose under a vanished heading to the top instead of dropping it. Release 0.10.2.
- **Update** First pilot fixes ([State](design/state.md), [Verification](design/verification.md)):
  - owner commands print the runnable `node .aidlc/bin/aidlc.mjs` form;
  - `next` asks for the migration intent in an adopted project with no intent;
  - the gate no longer asks quick-lane units for AC tests, and their card now carries the ACs as "done when" and the out of scope;
  - bundle-root interface links (`/intents/…`) render as repo paths on the card.
  Release 0.10.1.
- **Update** U11 built ([Board](design/board.md)): `aidlc sync` projects intents and units onto issues, sub-issues, labels and Project fields through `gh api`, writing only differences; `merge` runs it best-effort; `fix --from-issue` links a fix unit to its issue. A YAML fix: only a leading `0` makes an integer octal, so `12` is no longer read as 10. Release 0.10.0.
- **Update** U11 design settled with the owner ([Board](design/board.md)):
  - `sync` closes merged units' issues, and `merge` runs it best-effort instead of writing a `Closes` trailer;
  - `board.issue` in a doc links an existing issue, which is how adopted projects keep their board;
  - board fields live in a `board:` frontmatter map that the approval hash excludes;
  - field maps, labels, the body template and the 1,500-char cap.
- **Update** U8 built ([Skill and agents](design/prompts.md)):
  - the `aidlc` skill runs the loop on `next` and sets a project up;
  - the builder and reviewer agents, with the reviewer's JSON contract tested against [Verification](design/verification.md);
  - `next` names each required review focus and the reviewer's model;
  - the card lists requirements, fix-round findings and interface links as repo paths, and keeps inline code in ACs;
  - `tests/evals/run.mjs` builds the seeded-defect project and scores a run.
  Release 0.9.0.
- **Creation** [Skill and agents](design/prompts.md), the U8 design. It follows AWS AI-DLC (awslabs/aidlc-workflows at cd110cc), where the engine names the reviewer and the orchestrator only invokes it:
  - `next` names each review focus the gate requires, and a unit is `reviewed` once all have passed;
  - there is no separate `architecture` focus: every review reads the requirements and interfaces on the card, which now lists the requirements;
  - a fix round's card lists the findings;
  - `review record` reads the verdict from stdin with `-`;
  - `start` takes over the unit branch from a clean, stale earlier worktree.
  M1 U8 gains that scope; its AC-6 is reworded and AC-7 added.
- **Update** U7 built ([Hook mechanics](design/hooks.md)): eight hooks through a wrapper that calls the project's pinned CLI (guard, scope, secrets, model, docs, heartbeat, steer, status), with escalation after three identical denials. Release 0.8.0.
- **Creation** [Hook mechanics](design/hooks.md):
  - the wrapper allows in projects without a profile;
  - the deny lists;
  - secret patterns moved to `profile.security.secrets`;
  - steer lets a question through;
  - denial counting for escalation.
- **Update** U6 built ([Merge mechanics](design/gate.md)):
  - `merge` runs every gate condition on a trial merge in a temporary worktree, then fast-forwards the base;
  - `push` checks each new base commit;
  - `fix` writes a one-unit plan;
  - `check --ci` checks the base history since `adopted` and the architecture;
  - verdicts record their focus and card.
  Release 0.7.0.
- **Creation** [Merge mechanics](design/gate.md): the trial merge in a temporary worktree, gate codes, shared files, proof-revert, architecture edges, `push`, `fix` and the CI history check.
- **Creation** [Board](design/board.md): an optional, one-way GitHub issues and Project projection. It costs zero model tokens and has no scrum-master agent, because `next` already does that job. M1 gains U11.
- **Update** U5 built:
  - `init` renders the profile, AGENTS.md, CLAUDE.md, the bundle root, doc templates and CI, adds `.gitignore` lines and the worktree setting, and pins the CLI;
  - `--adopt` records the adoption commit and lists leftovers;
  - `upgrade` replaces only `.aidlc/bin`;
  - `check --ci` runs OKF validation and plan lint.
  Release 0.6.0.
- **Update** U5 design:
  - the plugin defaults move beside the CLI (`plugin/cli/defaults.json`), so a pinned copy carries them, and `levels` is replaced whole;
  - `init` takes flags, never overwrites without `--overwrite`, and lists what `--adopt` finds ([Profile and templates](design/profile.md)).
- **Creation** README with two diagrams: the whole AI-DLC lifecycle with the plugin's enforcement points, and the plugin's parts with what they write into a project. Linked from [Overview](design/overview.md).
- **Update** U10 built:
  - requirement docs are read by ID number;
  - `PLAN-REQ` applies once a bundle has a requirement;
  - requirements are approved, and the plan's draft ones come before the plan;
  - `status` lists undelivered requirements;
  - index prose is allowed and kept on regeneration ([OKF](design/okf.md), [Requirements and architecture checks](design/architecture.md)).
  Release 0.5.0.
- **Creation** [Requirements and architecture checks](design/architecture.md) and decision [0007](decisions/0007-requirements-and-architecture-checks.md):
  - lasting requirements are cited docs;
  - architecture boundaries and checks run on every merge;
  - adoption records a boundary commit.
  The M1 plan gains U10 and new ACs in U5, U6 and U8. The pilot becomes the migration of a real multi-service project. `OKF-INDEX` now allows prose, as the spec does.
- **Update** U4 built:
  - `status`, `next`, `approve`, `card`, `start`, `report` and `review record` work, all derived from git and the bundle;
  - `approve` accepts only Intent, Unit and Decision docs;
  - the card templates sit beside the CLI.
  Release 0.4.0.
- **Update** U4 settled with the owner ([State](design/state.md), [Unit card](design/unit-card.md)):
  - approval hashing, and approving several docs in one command;
  - the full `next` order, which exits 2 at owner gates;
  - the card template and its runtime record.
  Mermaid diagrams added to [Overview](design/overview.md), [Grid](design/grid.md) and [State](design/state.md).
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
