# Design

* [Overview](overview.md) - goals, non-goals, budgets, repo layout, glossary. Load first.
* [Grid](grid.md) - the AI-DLC rows, the plan-execute-validate loop, lanes, tests and doc types. Load when touching workflow logic.
* [State](state.md) - how progress is derived from git and docs, approvals, `next`, surviving a clear. Load when touching state or approvals.
* [Unit card](unit-card.md) - the generated brief each worker builds from. Load when touching cards or workers.
* [Team](team.md) - owner, lead, builder, reviewer, specialists; parallel rules, model routing and cost. Load when touching agents.
* [Verification](verification.md) - hooks, merge gate, reviewer contract, prompt evals, CI mode. Load when touching checks.
* [Steering](steering.md) - how blocks name their fix, the Stop hook keeps the lead on `next`, and retros improve rules. Load when touching hooks or retros.
* [Everyday paths](paths.md) - fixes, mid-flight changes, shared files, pushing, cleanup, adopting a project, removal. Load when touching merge, push or init.
* [Profile and templates](profile.md) - project profile, rule layers, templating, vendoring. Load when touching init or config.
* [CLI](cli.md) - commands, exit codes, output format. Load when touching the CLI.
* [OKF](okf.md) - the OKF rules the validator enforces and the configurable extras. Load when touching docs checks.
