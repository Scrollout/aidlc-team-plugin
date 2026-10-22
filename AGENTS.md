# AGENTS.md

A Claude Code plugin that brings AI-DLC (Intent → Units → Design → Code → Deployment → Operation), OKF docs and a small team of agents to any project, with every rule that matters enforced by a CLI or a hook.

## Read first
- `docs/index.md`: the docs bundle (OKF v0.2). Read an index, then one doc. Indexes are generated; never edit them by hand.
- `docs/constitution/principles.md`: the rules every change is checked against.
- `docs/roadmap/m1.md`: the current plan.

## Layout
- `plugin/`: what ships (CLI, hooks, agents, skill, templates). Nothing else is installed.
- `tests/`: `*.test.mjs`, run with `node --test`. Fixtures under `tests/fixtures/`, never named like a test file.
- `docs/`: design, decisions, roadmap.

## Rules
- Node 20+, zero dependencies, ESM (`.mjs`).
- Keep the budgets in `docs/design/overview.md`; CI fails when one is exceeded.
- Nothing the plugin writes into a project may name the plugin.
- Docs change before code; a design change updates its doc in the same commit.
- Run `node --test` before every commit.
