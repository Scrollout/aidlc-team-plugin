# Design

* [Agents in flight](in-flight.md) - How the CLI knows a builder, reviewer or researcher is still running - the marks the hooks touch and how long one stays fresh.
* [Approvals](approvals.md) - How the owner approves intents, requirements, units and decisions, what makes an approval stale, what the lead may approve for them, and how owner prompts are recorded.
* [Board](board.md) - An optional one-way projection of derived state onto GitHub issues and a GitHub Project, written by deterministic code at zero model tokens.
* [Build method from day one](method.md) - Draft - how a project gets the build method on its first init - level runs asked at init, a constitution that names the check behind each rule, and an upgrade that adds what an older project lacks.
* [CI check](ci-check.md) - What aidlc check --ci adds in CI - the base history since adoption, architecture on the checked-out tree, and a GitHub Actions job summary the owner reads on the run page.
* [CI on the base](base-ci.md) - Draft - with profile ci.wait, no builder starts on a base whose CI is unknown or red - push first, wait for the base's GitHub Actions runs, and on a red base only a fix unit builds.
* [CLI](cli.md) - The aidlc commands, their exit codes and the terse output format.
* [CLI engine](cli-engine.md) - How the CLI's command handlers and hook rules return data for adapters to render, and the limits the CLI is built within.
* [Deployment and operation](operations.md) - How the grid's Deployment and Operation rows run after an intent merges - deploy check, release, smoke, rollback, runbook and feedback - with the commands from the project profile.
* [Design rows before code](design-rows.md) - Draft - the grid's Domain and Logical rows are checked - a full-lane unit carries a Domain and a Logical section, a standard-lane unit a Logical one, approved with the plan, on the card, and checked by every review.
* [Everyday paths](paths.md) - Fixes without an intent, changes mid-flight, shared files, pushing and base health, cleanup, adopting an existing project, and removing the plugin.
* [Grid](grid.md) - The AI-DLC rows, the plan-execute-validate loop in each cell, lanes and the doc types each row produces.
* [Guard limits](guard-limits.md) - Draft - what the hooks do not stop, by the owner's choice of 2026-10-24 - deliberate evasion such as shell wrappers, Bash writes to state files and raw API calls - and what catches each instead.
* [Hook checks](hook-checks.md) - What each hook checks or records - guard, scope, secrets, model, docs, heartbeat, steer, prompt, status and denied.
* [Hook mechanics](hooks.md) - How the plugin's hooks reach the pinned CLI, how they fail, the host facts they rely on, and how repeated denials escalate.
* [Intent states](intent-states.md) - The states an intent passes through, from draft to released, with the deploy check, the owner's typed release, smoke, rollback, the fix unit after it, the back-fill shortcut and release by tag.
* [Merge mechanics](gate.md) - How aidlc merge and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, test runs, proof-revert and the CI history check.
* [OKF](okf.md) - How the plugin writes, indexes and validates OKF v0.2 bundles, following the official spec and its reference implementation.
* [OKF validation](okf-validation.md) - The OKF errors and house-rule warnings the validator reports, and the YAML subset it reads frontmatter with.
* [Overview](overview.md) - Goals, non-goals, budgets, repo layout and glossary of the plugin.
* [Parallel builders](parallel.md) - How the lead runs builders side by side in worktrees, what the agents' frontmatter sets for that, and how their units are merged.
* [Plan lint](plan-lint.md) - The checks aidlc check runs on intents and units before the owner approves them, each with its code.
* [Profile and templates](profile.md) - The project profile, rule layers, the template engine and what init renders and reports.
* [Proof for back-fill tests](backfill.md) - Draft - how a tests-only unit, one that adds characterization tests for code built before a migration, proves its tests can fail - the builder lists one mutation per AC and the gate applies each.
* [Requirements and architecture checks](architecture.md) - Lasting requirements as their own docs, and architecture rules as checks that fail a merge, so a project cannot drift from its intended shape.
* [Resume](resume.md) - How the lead survives a clear, a crash or a new session - what lives on disk instead of the conversation - and why the owner clears the lead between intents.
* [Review rounds](review-rounds.md) - What review record does with a verdict - fix rounds and their limit, send-backs, and which focus passes still count after a fix.
* [Skill and agents](prompts.md) - What the lead's skill and the builder and reviewer prompts say, how a review is picked and run, and why the prompts restate no enforced rule.
* [State](state.md) - How the CLI derives progress from git and docs, how approvals work, and how next picks the one allowed step.
* [Steering](steering.md) - How the plugin corrects the agent during work, keeps it moving, and improves its rules over time without growing.
* [Team](team.md) - The four roles, how parallel worktree workers are run and merged, and where tokens are spent.
* [Unit card](unit-card.md) - The generated, read-only brief one builder works from and one reviewer checks against.
* [Vendoring](vendoring.md) - How init and upgrade copy the CLI into a project and pin it, and why only a release is copied.
* [Verification](verification.md) - The inner loop (hooks), the merge gate, the reviewer's output contract and the CI mode.
