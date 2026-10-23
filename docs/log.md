---
type: Log
title: aidlc-team-plugin docs history
---

# Bundle history

## 2026-10-23

- **Update** M3 U28 built: proof-revert. On a green merge result the gate puts the unit's code back as at the base and runs again each level holding one of its tagged tests; one that still passes is `GATE-PROOF`. Quick-lane, test-only and run-less units skip it and say so; the merge records a `Proof:` trailer; the card and the builder's prompt name the check ([Merge mechanics](design/gate.md), [Verification](design/verification.md), [Unit card](design/unit-card.md)). Release 0.35.0.
- **Update** M3 U27 built: the card carries each `.aidlc/rules/*.md` at the base commit, before the ACs and within its cap, except a rule a review focus reads; the research brief carries the same rules; a card over the cap names the rules' share ([Unit card](design/unit-card.md), [Skill and agents](design/prompts.md)). Release 0.34.0.
- **Update** [M3](roadmap/m3.md) planned in part: exit criteria, U27 project rules on the card and U28 proof-revert, for the owner's approval; the CLI budget rises to 3,400 lines ([Overview](design/overview.md), owner's choice).
- **Update** [M2](roadmap/m2.md) closed (owner's choice): CI on three platforms, the retro and the CLI budget met; the last lead steps of re-pilot 2 are fixed in 0.32.1 and 0.33.0. [M3](roadmap/m3.md) takes the project's doc rules for digests and the re-pilots' review and token findings.
- **Update** Fix from M2 re-pilot 2: the research brief tells the lead to run `aidlc check` and the project's doc checks on the digest and send findings back to the researcher, never editing it; the researcher keeps the whole file within the brief's cap ([Skill and agents](design/prompts.md)). Release 0.33.0.
- **Creation** [M2 re-pilot 2 report](pilot/m2-repilot2-report.md): two parallel units on 0.32.0, no fix rounds, three typed approvals. M2 stays open on one gap: the lead resent a research digest that broke the project's doc rules ([M2](roadmap/m2.md#result)).
- **Update** Fix from M2 re-pilot 2: a draft's plan fields (a hold's question, priority, board) are no open points, so a research question with `<…>` in it no longer keeps its answered hold on ([State](design/state.md)). Release 0.32.1.
- **Update** M2 U26 built: `review record` tells the reviewer when its `fix` became `escalate` and why; the card heads findings the owner answered by re-approving as such; the retro lists approvals of the decisions the intent's docs cite ([Verification](design/verification.md), [Unit card](design/unit-card.md), [Steering](design/steering.md)). Release 0.32.0.
- **Update** M2 U25 built: the model hook marks a researcher in flight from its brief's first line and its calls keep the mark fresh, so `next` waits for it and steer no longer demands it again; a filed digest that answers a `research:` hold releases it; the brief caps the whole digest, frontmatter included, at the bundle's cap and asks for `generated` ([State](design/state.md), [Hooks](design/hooks.md), [Skill and agents](design/prompts.md)). Release 0.31.0.
- **Update** M2 U24 built ([0011](decisions/0011-plain-word-approval.md)): a prompt that is exactly `approve <doc>…` stamps those docs as the owner through a UserPromptSubmit hook and tells the lead; the guard denies a scheduled task or loop with such a prompt; an older pinned CLI never blocks a prompt; every owner step `next` names gives the words to type, an escalation included, and no message offers `!` ([Hooks](design/hooks.md), [Approvals](design/approvals.md)). Release 0.30.0.
- **Creation** [0011 Plain-word approval](decisions/0011-plain-word-approval.md) (owner's choice): the owner approves by typing `approve <doc>…`. **Update** [M2](roadmap/m2.md): units U24 to U26 carry the re-pilot's gaps, then a short re-pilot. The [re-pilot report](pilot/m2-repilot-report.md) no longer counts the lead's second `upgrade` as a retro error, since the owner answered its prompt.
- **Creation** [M2 re-pilot report](pilot/m2-repilot-report.md): one intent with two parallel units on 0.29.0. The auto mode refusals and the M2 profile edit are gone, and the retro criterion holds. The research loop and the escalation step still need the lead or a `!` command, so M2 stays open ([M2](roadmap/m2.md#result)).
- **Creation** [M3](roadmap/m3.md) draft: project rules on the card, proof-revert, a simplicity check in the general review if needed, a complexity check for this repo, the advisor if needed, and the cuts carried from M2 (owner's brainstorm on agent code quality).
- **Update** M2 U23 built ([0010](decisions/0010-research-and-advice.md)): the lead holds a question with `aidlc hold <doc> research: <question>`; `next` names the researcher, an agent with read and web tools only on `models.research` (model hook); `aidlc research <doc>` prints its brief from the project's docs, stack files and `research.sources`, with no plugin source list; the digest is filed under the bundle's `research/`, and a question it answers is not researched again ([Skill and agents](design/prompts.md), [Team](design/team.md), [State](design/state.md), [Profile](design/profile.md)). Release 0.29.0.
- **Update** M2 U21 built: the counters keep each stop report and each command auto mode refused, and `since` is only the last retro's reset; `aidlc retro` lists a stop a restart replaced, every owner approval of the intent's docs from their stamps (a `!` command included), the other owner commands and the refusals ([Steering](design/steering.md)). Release 0.28.0.
- **Update** M2 U22 built: a unit whose scope holds the project profile passes `PLAN-TEST`, since it adds its test location to `levels` with the test and the base never names a path with no file; `PLAN-MODULE` flags a unit module the profile lacks; the card matches modules by `id`, or `name` when one has none; requirement ids print as their files name them (`R-024`), so board labels follow that form ([Grid](design/grid.md), [Unit card](design/unit-card.md)). Release 0.27.0.
- **Update** M2 U20 built (owner's choice: the plugin writes no permission rules): a command auto mode refuses is recorded by a PermissionDenied hook with the commit it was refused at, and `next` hands it to the owner (`aidlc approve <docs>` for a delegated approval, a permission prompt), so steer stops demanding it; `next` names a builder still holding a merged unit's worktree ([Approvals](design/approvals.md), [Hooks](design/hooks.md), [State](design/state.md)). Release 0.26.0.
- **Creation** [0010 Research for open questions](decisions/0010-research-and-advice.md) (owner's choice): a researcher subagent on a cheap model, project sources only, official ones first; the owner still decides. **Update** [M2](roadmap/m2.md): units U20 to U23 carry the pilot's gaps and the researcher, then a re-pilot.
- **Creation** [M2 pilot report](pilot/m2-report.md): the second pilot, one intent with two parallel units on 0.25.0. Windows CI and the CLI budget hold; steps outside `next` and the retro's gaps keep M2 open ([M2](roadmap/m2.md#result)).
- **Update** M2 U14 built: `sync` treats an issue list shorter than the repository's issue count as a lagging read, retries with backoff and creates nothing while it stays short; `PLAN-BOARD` names the board field and gives an example from the profile's own map ([Board](design/board.md)). Release 0.25.0. All M2 units are built; the second pilot remains for the exit criteria.
- **Update** M2 U13 built: every test makes its temp folders under one root that is removed when the run ends, also on failure, and the gate's trial worktree removes its parent folder; `init` adds the builders' worktree folder to the project's other ignore files and offers its lint target as a module check; `push` on a base never pushed checks only the commits after the one that added the profile ([Profile](design/profile.md), [Merge mechanics](design/gate.md)). Release 0.24.0.
- **Update** M2 U16 built: `start` merges the card's base into an existing unit branch, so a restarted builder sees the work merged since; `upgrade` copies a release and refuses a plugin checkout with uncommitted changes unless the owner passes `--dirty` ([Profile](design/profile.md), [Skill and agents](design/prompts.md), [CLI](design/cli.md)). Release 0.23.0.
- **Update** M2 U19 built: the docs hook rewrites a `generated.at` written in local time to UTC; `check` on a folder below the bundle root resolves bundle-root links from the root; regenerated indexes keep an entry's hint and a hand-written subfolder line; runtime counters in `.git/aidlc/stats.json` and the new `aidlc retro I-<n>`, modelled on AWS AI-DLC's learnings ritual ([OKF](design/okf.md), [Hooks](design/hooks.md), [CLI](design/cli.md), [Steering](design/steering.md)). Release 0.22.0.
- **Update** M2 U18 built, from AWS AI-DLC's verification command, unit review and loop-back (owner asked for the research): every level `run` is on the card, run by the reviewer and by the gate on the merge result (`GATE-RUN`, `Tested` trailer); a quick unit's AC commands run at merge; `next` offers a merge only when each AC has a tagged test; an owner re-approval after an escalation marks its findings answered and goes straight to review; `fix` on a full-lane path writes a unit for the owner to approve; builders run checks as one plain command, since the host's worktree isolation refused the pilot's compound ones ([Merge mechanics](design/gate.md), [State](design/state.md), [Unit card](design/unit-card.md), [Skill and agents](design/prompts.md), [Hooks](design/hooks.md)). Release 0.21.0.
- **Update** M2 U17 built (owner's choice for AC-3): plan lint flags a non-quick unit whose scope cannot hold an AC's test (`PLAN-TEST`), suggests the leading `/` when a bare file name causes a scope overlap, and flags an AC that names another unit's output with no dependency path to it (`PLAN-DEPENDS`) ([Grid](design/grid.md)). Release 0.20.0.

## 2026-10-22

- **Creation** [Approvals](design/approvals.md), split out of [State](design/state.md): stamps, who approves, and owner prompts.
- **Update** M2 U15 built (owner's choices): an owner gate holds back only the units that wait on its docs, so independent units build first; the guard records owner prompts and `status` shows whether the last one ran; a builder launched after a stop report takes over; the lead parks a step with `aidlc hold U-<n> <question>`, and a held unit gets no action; the new owner command `aidlc mode` records the run mode and steer's stopping point; `next` asks for the draft decisions a unit links to; a delegated re-approval refuses a change to acceptance criteria; `MODEL-MISMATCH` names its source and the card prints the review model ([State](design/state.md), [Hooks](design/hooks.md), [CLI](design/cli.md)). Release 0.19.0.
- **Update** M2 U12 built: the CLI and hooks run on Windows, and CI requires it. Paths in output and cards use `/` on every platform, the working folder is resolved to its real long path, the repo checks out with LF line ends, and `github.gh` names another `gh` ([CLI](design/cli.md), [Board](design/board.md)). Release 0.18.0.
- **Update** [M2](roadmap/m2.md) planned with the owner: hardening from the pilot plus `aidlc retro`, in eight units U12–U19; the other work cut from M1 moves to M3. The CLI budget rises to 3,000 lines ([Overview](design/overview.md)), and a delegated re-approval no longer covers a change to acceptance criteria ([0008](decisions/0008-delegated-approvals.md)).
- **Update** [M1](roadmap/m1.md) is closed: every exit criterion has its evidence in the [pilot report](pilot/report.md). Next is [M2](roadmap/m2.md).
- **Update** [Hooks](design/hooks.md): with the pinned CLI missing, only tool calls are denied, and the message names the owner's `!` upgrade command; the Stop hook had blocked every turn end (U7/AC-3 check). [M1 pilot report](pilot/report.md) records the check and the passing mid-elaboration clear. Release 0.17.1.
- **Update** [State](design/state.md): `next` sends the lead back to a draft intent, requirement or unit that still has a template placeholder or an open question, before approvals and unit work, and never offers such a doc for approval; a clear mid-elaboration had led back to unit work (prompt evals, owner's choice). Release 0.17.0.
- **Update** [M1 pilot report](pilot/report.md): a `/clear` mid-elaboration lost an owner answer and the lead did not return to the draft intent; both are in [M2](roadmap/m2.md).
- **Update** [M1 pilot report](pilot/report.md): prompt evals on 0.16.1 found all four seeded defects and the builder stopped on the interface change (U8/AC-5); two findings went to [M2](roadmap/m2.md).
- **Creation** [M1 pilot report](pilot/report.md) and [Pilot interventions](pilot/interventions.md): wall time, tokens, fix rounds, denials, and each manual step mapped to its fix or an M2 item. [M2](roadmap/m2.md) collects those items; [M1](roadmap/m1.md) records the U9 result. The prompt evals are still pending.
- **Update** `sync` creates the milestone of an intent with no target without a due date, which GitHub requires to be absent rather than null. Release 0.16.1.
- **Update** [Board](design/board.md): plan lint requires the board values the profile maps (`PLAN-BOARD`), `board.wave` is derived from dependencies, and `sync` sets assignees, a milestone per intent and the issue type (owner's choices after the pilot board showed only Status). The CLI budget rises to 2,600 lines for it ([Overview](design/overview.md)). Release 0.16.0.
- **Update** A hook whose `cwd` is outside any work tree (a shell left in `.git/aidlc`) judges from the project folder instead of failing, which had blocked every Bash call, `cd` included (pilot finding, [Hooks](design/hooks.md)). Release 0.15.1.
- **Update** The marketplace is `scrollout.net`, so the install id is `aidlc-team@scrollout.net` (owner's request; remove the old `aidlc-team` marketplace and add the repo again). `sync` matches the oldest issue with a marker, and lists the issues once more before creating one, after a merge's sync duplicated a whole board (pilot finding, [Board](design/board.md)). Release 0.15.0.
- **Update** The AC-test gate reads `levels` from the merged tree's profile, so a unit that adds a test location passes it, and a doc in the bundle that names an AC tag no longer counts as its test (pilot findings, owner's decision, [Gate](design/gate.md)). Release 0.14.5.
- **Update** Node 22 is the minimum, since Node 20 reached end of life on 2026-04-30; CI tests Node 22, 24 and 26 with `actions/checkout@v7` and `actions/setup-node@v7`, and the project CI template uses the same actions on the latest LTS (owner's request). Release 0.14.4.
- **Update** `upgrade` refuses an installed plugin older than the pinned CLI unless the owner passes `--downgrade` (pilot finding, [Profile](design/profile.md)). New budget: a blocking hook runs in 500 ms ([Overview](design/overview.md)). The scope and docs hooks resolve real paths, so a symlink in the session's path (as macOS's `/var` → `/private/var`) cannot escape a unit's scope, and the CLI runs when started through a symlink. CI runs on Linux and macOS with Node 20 and 22, with Windows reported but not yet required, and a scenario test walks a unit through a clear, a lost builder and fix rounds (owner's request). Release 0.14.3.
- **Update** `start` takes over any clean earlier worktree of the unit, since the launch mark of 0.14.1 made a finished one look live; the scope hook reads the scope from the unit's card, so a card widened on the base applies to an older branch (pilot findings, [Skill and agents](design/prompts.md), [Hooks](design/hooks.md)). Release 0.14.2. CI writes a job summary: version, test counts, docs check, CLI size and any failures (owner's request).
- **Update** The model hook marks a builder in flight at launch, and a fix round whose builder runs reads as building, so `next` and the Stop hook stop re-offering it; a verdict older than the builder's last report no longer counts, so a fix round reported without a new commit gets a new review (pilot findings, [Hooks](design/hooks.md), [State](design/state.md)). Release 0.14.1.
- **Update** [M1](roadmap/m1.md) U1/AC-5: CI runs on every branch push but no longer on release tags, which point at commits CI already tested (owner's request).
- **Update** [0008 Delegated approvals](decisions/0008-delegated-approvals.md): delegated approvals are stamped `process:delegated`, an OKF v0.2 actor, instead of `agent:auto`, which OKF has no prefix for (pilot finding, owner's choice); earlier `agent:auto` stamps still count. Release 0.14.0.
- **Update** An intent that is merged but not yet released no longer holds back the next intent: `next` serves the next intent's work and offers the release once that is idle (pilot finding, [State](design/state.md)). Release 0.14.0.
- **Update** A reviewer's tool calls no longer keep a builder's heartbeat fresh, so a fix-round builder takes over the clean worktree; a stopped builder's advice asks for a re-approval only when the unit doc is wrong (pilot findings, [Hooks](design/hooks.md), [State](design/state.md)). Release 0.13.4.
- **Update** `review record` ends the review in flight, so a unit's next focus is offered while another unit's reviewer runs (pilot finding, [Hooks](design/hooks.md)). Release 0.13.3.
- **Update** A delegated re-approval of a stopped unit now restarts its builder, as an owner one does; answering an escalation still takes the owner (pilot finding). Release 0.13.2.
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
