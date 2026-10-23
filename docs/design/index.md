# Design

* [Agents in flight](in-flight.md) - How the CLI knows a builder, reviewer or researcher is still running - the marks the hooks touch and how long one stays fresh.
* [Approvals](approvals.md) - How the owner approves intents, requirements, units and decisions, what makes an approval stale, what the lead may approve for them, and how owner prompts are recorded.
* [Board](board.md) - An optional one-way projection of derived state onto GitHub issues and a GitHub Project, written by deterministic code at zero model tokens.
* [CLI](cli.md) - The aidlc commands, their exit codes and the terse output format.
* [Deployment and operation](operations.md) - Draft - how the grid's Deployment and Operation rows run after an intent merges - deploy check, release, smoke, rollback, runbook and feedback - with the commands from the project profile.
* [Everyday paths](paths.md) - Fixes without an intent, changes mid-flight, shared files, pushing and base health, cleanup, adopting an existing project, and removing the plugin.
* [Grid](grid.md) - The AI-DLC rows, the plan-execute-validate loop in each cell, lanes and the doc types each row produces.
* [Hook mechanics](hooks.md) - How the plugin's hooks reach the pinned CLI, what each one checks, and how repeated denials escalate.
* [Merge mechanics](gate.md) - How aidlc merge, push, fix and check --ci carry out the gate in Verification - the trial merge, the codes, shared files, architecture rules and the CI history check.
* [OKF](okf.md) - How the plugin writes, indexes and validates OKF v0.2 bundles, following the official spec and its reference implementation.
* [Overview](overview.md) - Goals, non-goals, budgets, repo layout and glossary of the plugin.
* [Plan lint](plan-lint.md) - The checks aidlc check runs on intents and units before the owner approves them, each with its code.
* [Profile and templates](profile.md) - The project profile, rule layers, the template engine and how the CLI is vendored and pinned.
* [Requirements and architecture checks](architecture.md) - Lasting requirements as their own docs, and architecture rules as checks that fail a merge, so a project cannot drift from its intended shape.
* [Resume](resume.md) - How the lead survives a clear, a crash or a new session - what lives on disk instead of the conversation - and why the owner clears the lead between intents.
* [Review rounds](review-rounds.md) - What review record does with a verdict - fix rounds and their limit, send-backs, and which focus passes still count after a fix.
* [Skill and agents](prompts.md) - What the lead's skill and the builder and reviewer prompts say, how a review is picked and run, and why the prompts restate no enforced rule.
* [State](state.md) - How the CLI derives progress from git and docs, how approvals work, and how next picks the one allowed step.
* [Steering](steering.md) - How the plugin corrects the agent during work, keeps it moving, and improves its rules over time without growing.
* [Team](team.md) - The four roles, how parallel worktree workers are run and merged, and where tokens are spent.
* [Unit card](unit-card.md) - The generated, read-only brief one builder works from and one reviewer checks against.
* [Verification](verification.md) - The inner loop (hooks), the merge gate, the reviewer's output contract and the CI mode.
