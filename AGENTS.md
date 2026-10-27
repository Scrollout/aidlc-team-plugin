# AGENTS.md

A Claude Code plugin that brings AI-DLC (Intent → Units → Design → Code → Deployment → Operation), OKF docs and a small team of agents to any project, with every rule that matters enforced by a CLI or a hook.

## Read first
- `docs/index.md`: the docs bundle (OKF v0.2). Read an index, then one doc. Indexes are generated; never edit them by hand.
- `docs/constitution/principles.md`: the rules every change is checked against.
- `docs/roadmap/index.md`: the milestone plans; the newest one is the current plan.

## Layout
- `plugin/`: what ships (CLI, hooks, agents, skill, templates). Nothing else is installed.
- `tests/`: `*.test.mjs`, run with `node --test`. Fixtures under `tests/fixtures/`, never named like a test file. Temp folders come only from `tempDir()` in `tests/state-repo.mjs`, which removes them when the run ends.
- `docs/`: design, decisions, roadmap.
- `examples/`: what does not ship, such as the control-plane model a project copies into its own `.aidlc/models/`.

## Rules
- Node 24+ (the Node lines CI tests), zero dependencies, ESM (`.mjs`).
- Keep the budgets in `docs/design/overview.md`; CI fails when one is exceeded.
- Nothing the plugin writes into a project may name the plugin.
- Docs, comments and commit messages state rules and reasons in general terms, never session history ([Standard formats](docs/design/standards.md#rationale)).
- Docs change before code; a design change updates its doc in the same commit.
- Run `node --test` before every commit.
