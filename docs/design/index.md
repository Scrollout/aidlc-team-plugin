# Design

* [Agents in flight](in-flight.md) - How the CLI knows a builder, reviewer or researcher is still running - the marks the hooks touch and how long one stays fresh.
* [Approvals](approvals.md) - How the owner approves intents, requirements, bolts and decisions, what makes an approval stale, what the lead may approve for them, and how owner prompts are recorded.
* [Architecture in arc42](arc42.md) - The plugin's architecture in arc42's twelve sections, each pointing at the design doc or generated page that holds it, with a C4 component view of the CLI.
* [Architecture model](architecture-model.md) - The system's core and extensions, seven closed module kinds with what each may depend on, four inward-pointing layers, client, server and event surfaces, and data owned by one domain; boundaries are computed from these declarations, never written by hand.
* [Board](board.md) - An optional one-way projection of derived state onto GitHub issues and a GitHub Project, written by deterministic code at zero model tokens.
* [Bolt card](bolt-card.md) - The generated, read-only brief one builder works from and one reviewer checks against, for a bolt or a v1 unit.
* [Build method from day one](method.md) - How a project gets the build method on its first init - level runs asked at init, a constitution that names the check behind each rule, and an upgrade that adds what an older project lacks.
* [Bundle v2](bundle.md) - The project's OKF bundle as AI-DLC's context memory - one folder per closed doc type, authored and generated docs kept apart, a front-matter schema per type, typed references, decisions superseded never amended, CLI-made ids and slugs, and errors on the base.
* [Canonical model](canonical-model.md) - One word per concept at each scale (system, domain, code, delivery), mapped to AI-DLC's Intent, Unit and Bolt, with the rule that a word used in another sense fails a check and that an approved intent keeps the method version it was approved under.
* [CI check](ci-check.md) - What aidlc check --ci adds in CI - the base history since adoption, architecture on the checked-out tree, and a GitHub Actions job summary the owner reads on the run page.
* [CI on the base](base-ci.md) - With profile ci.wait, no builder starts on a base whose CI is unknown or red - push first, wait for the base's GitHub Actions runs, and on a red base only a fix bolt builds.
* [CLI](cli.md) - The aidlc commands, their exit codes and the terse output format.
* [CLI engine](cli-engine.md) - How the CLI's command handlers and hook rules return data for adapters to render, and the limits the CLI is built within.
* [Codebase map](codebase-map.md) - A generated doc in the project's bundle showing the codebase as a tree of modules, with each module's data, public paths and dependencies, rewritten at every merge so it never drifts.
* [Construction by proof](construction.md) - Bolts bound to one domain, parallel work by ownership, a run-time proof per level, security findings disposed by the owner, increment 1 done on its target, requirements delivered only by released tests, one-AC fix bolts, escape hatches that expire, and a retro that measures.
* [Current dependencies](dependencies.md) - Every dependency is the newest stable release with every known security fix, looked up from its registry when it is added or bumped, never from a model's memory, and scanned at merge and in CI.
* [Data ownership](data-ownership.md) - Each piece of stored data has one owning module; another module reaches it only through the owner's interface, an event or a shared service, and the merge gate checks it.
* [Deployment and operation](operations.md) - How the grid's Deployment and Operation rows run after an intent merges - deploy check, release, smoke, rollback, runbook and feedback - with the commands from the project profile.
* [Design rows before code](design-rows.md) - The grid's Domain and Logical rows are checked - a full-lane bolt carries a Domain and a Logical section, a standard-lane bolt a Logical one, approved with the plan, on the card, and checked by every review.
* [Elaboration checks](elaboration.md) - What the CLI checks while the lead elaborates an intent with the owner - every claim sourced, every request sentence covered, the corner checklist settled, vague answers followed up, and the owner's read-back confirmed.
* [Everyday paths](paths.md) - Fixes without an intent, changes mid-flight, shared files, pushing and base health, cleanup, adopting an existing project, and removing the plugin.
* [Extension commands](cli-extensions.md) - The aidlc commands the CLI's extensions add - the stack packs' graph and scaffold, the board's sync, operations' deploy, release, rollback and retro, intake and models - with what each does and who runs it.
* [Grid](grid.md) - The AI-DLC rows, the plan-execute-validate loop in each cell, lanes and the doc types each row produces.
* [Guard limits](guard-limits.md) - What the hooks do not stop, by the owner's choice of 2026-10-24 - deliberate evasion such as shell wrappers, Bash writes to state files and raw API calls - and what catches each instead.
* [Hook checks](hook-checks.md) - What each hook checks or records - guard, scope, secrets, model, docs, heartbeat, steer, prompt, status and denied.
* [Hook mechanics](hooks.md) - How the plugin's hooks reach the pinned CLI, how they fail, the host facts they rely on, and how repeated denials escalate.
* [Inception](inception.md) - A deterministic Inception - a pathway per intent with the steps it requires, a sized intent whose questions are answered by option, domain docs and a generated context map, platform facts probed on the target, structured decisions within a horizon and superseded never amended, a coherence check over them, a recorded design review, and one-way doors approved one at a time.
* [Increments and bolts](increments-and-bolts.md) - An intent ships in increments (increment 1 the walking skeleton on its target), each built by bolts B-<n> that the CLI allocates, with legacy units read as aliases only; replaces the intent's Slices section, the Spec labels and the slice cap.
* [Intake](intake.md) - plain prose from anyone turned into AI-DLC work for any project - the request kept word for word, the pathway and stack detected, the lead in role personas, every claim tied to a source, corners settled, vague answers resolved, an advisory review before approval, and subagents that get exactly their brief.
* [Intent states](intent-states.md) - The states an intent passes through, from draft to released, with the deploy check, the owner's typed release, smoke, rollback, the fix bolt after it, the back-fill shortcut and release by tag.
* [Library and extensions](library.md) - The CLI as a layered library (foundation kits, domains, a runtime) with a public entry, named seams the core declares, and opt-in extensions that plug into them, each layer and extension with its own budget.
* [Merge mechanics](gate.md) - How aidlc merge and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, test runs, proof-revert and the CI history check.
* [Models](models.md) - architecture models as data - a proven system's vertical and horizontal shape distilled from research, shipped or kept by a project, applied to new and existing projects by the AI-DLC method, and held by generic rule types.
* [Module surfaces and cycles](module-surface.md) - A module other modules may reach only through the public paths it declares, and modules that never depend on each other in a circle, both checked at merge.
* [Naming](naming.md) - Names composed from a registry, never invented - tokens, domains, closed vocabularies and banned words in the profile, a grammar per kind of name with the reference cloud's API and event rules as default, names printed by the CLI, and rules generated from the registry and checked on code, contracts and docs.
* [OKF](okf.md) - How the plugin writes, indexes and validates OKF v0.2 bundles, following the official spec and its reference implementation.
* [OKF validation](okf-validation.md) - The OKF errors and house-rule warnings the validator reports, and the YAML subset it reads frontmatter with.
* [Overview](overview.md) - Goals, non-goals, budgets, repo layout and glossary of the plugin.
* [Parallel builders](parallel.md) - How the lead runs builders side by side in worktrees, what the agents' frontmatter sets for that, and how their bolts are merged.
* [Pipeline](pipeline.md) - The governance pipeline a bolt passes through, in order - the checks before any work reaches a builder, and the checks after, each with its command, hook and codes.
* [Plan lint](plan-lint.md) - The checks aidlc check runs on intents and bolts before the owner approves them, each with its code.
* [Profile and templates](profile.md) - The project profile, rule layers, the template engine and what init renders and reports.
* [Proof for back-fill tests](backfill.md) - How a tests-only bolt, one that adds characterization tests for code built before a migration, proves its tests can fail - the builder lists one mutation per AC and the gate applies each.
* [Requirements and architecture checks](architecture.md) - Lasting requirements as their own docs, and architecture rules as checks that fail a merge, so a project cannot drift from its intended shape.
* [Resume](resume.md) - How the lead survives a clear, a crash or a new session - what lives on disk instead of the conversation - and why the owner clears the lead between intents.
* [Review rounds](review-rounds.md) - What review record does with a verdict - fix rounds and their limit, send-backs, and which focus passes still count after a fix.
* [Skill and agents](prompts.md) - What the lead's skill and the builder and reviewer prompts say, how a review is picked and run, and why the prompts restate no enforced rule.
* [Stack packs](stack-packs.md) - A stack pack per language (Go first, then TypeScript) holds the layout of every module kind, the scaffold templates, a tested reference domain and the dependency-graph extractor the plugin trusts, all as data the CLI reads.
* [Standard formats](standards.md) - Decisions in MADR 4.0, acceptance criteria as Given/When/Then, requirements in EARS, releases in Keep a Changelog with SemVer, and architecture in arc42 with C4 levels, each checked by the CLI on drafts and on intents approved under method 5.
* [State](state.md) - How the CLI derives progress from git and docs, how approvals work, and how next picks the one allowed step.
* [Steering](steering.md) - How the plugin corrects the agent during work, keeps it moving, and improves its rules over time without growing.
* [Team](team.md) - The four roles, how parallel worktree workers are run and merged, and where tokens are spent.
* [Vendoring](vendoring.md) - How init and upgrade copy the CLI into a project and pin it, and why only a release is copied.
* [Verification](verification.md) - The inner loop (hooks), the merge gate, the reviewer's output contract and the CI mode.
* [Workload identity](workload-identity.md) - Runtimes, domains and data authenticate by workload identity with short-lived credentials, never by shared or static secrets; a merge check fails the common static forms on added lines.

# Subdirectories

* [diagrams](diagrams/index.md)
