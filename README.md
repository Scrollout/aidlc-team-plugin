# aidlc-team

[![CI](https://github.com/Scrollout/aidlc-team-plugin/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Scrollout/aidlc-team-plugin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/tag/Scrollout/aidlc-team-plugin?filter=v*&sort=semver&label=release)](https://github.com/Scrollout/aidlc-team-plugin/tags)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/en/about/previous-releases)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](plugin/cli)
[![License](https://img.shields.io/github/license/Scrollout/aidlc-team-plugin)](LICENSE)

A Claude Code plugin that runs the AI-DLC lifecycle (Inception, Construction, Operations) in any project. It uses an OKF docs bundle and a small team of agents, and every rule that matters is enforced by a CLI or a hook, not by prose.

```
/plugin marketplace add Scrollout/aidlc-team-plugin
/plugin install aidlc-team@scrollout.net
```

## How AI-DLC runs with the plugin

```mermaid
flowchart TB
  owner(["Owner"])
  next{{"aidlc next<br/>one action, derived from git + docs"}}

  subgraph inception["Inception: owner and lead"]
    req["Requirements R-n<br/>lasting, approved"]
    intent["Intent I-n<br/>goal, why, slices, risks"]
    plan["Plan: units U-n<br/>ACs with test levels, scope,<br/>depends, reservations"]
    researcher["Researcher<br/>cited digest for a held question,<br/>official sources first"]
    decision["Decisions"]
    req --> intent --> plan
    researcher --> decision
  end

  subgraph construction["Construction: per unit, in parallel worktrees"]
    card["Card<br/>from the base commit: spec line,<br/>why, ACs, scope, references"]
    builder["Builder<br/>tests first, only inside scope"]
    reviewer["Reviewer<br/>one per focus, fresh context,<br/>JSON verdict"]
    gate{"Merge gate<br/>scope, AC tests, checks, review,<br/>proof: code reverted or mutations,<br/>OKF, security, architecture"}
    card --> builder --> reviewer
    reviewer -- "fix, at most 3 rounds" --> builder
    reviewer -- pass --> gate
  end

  subgraph operations["Deployment and Operation: when the profile deploys"]
    base["Base branch<br/>merges carry Unit, Card, Review,<br/>Tested, Proof trailers"]
    ci["Push and CI<br/>aidlc push, aidlc ci wait"]
    check["Deploy check<br/>aidlc deploy check I-n, per merged slice"]
    release["Release, owner step<br/>aidlc release I-n"]
    smoke["Smoke<br/>runs after the release"]
    rollback["Rollback, owner step<br/>aidlc rollback I-n"]
    fixunit["Fix unit<br/>aidlc fix --after I-n"]
    released(["Released"])
    base --> ci -- green --> check -- pass --> release --> smoke -- pass --> released
    check -- fail --> fixunit
    smoke -- fail --> rollback --> fixunit
  end

  plan --> card
  gate -- "merge --no-ff" --> base
  fixunit -- "plan work" --> card

  owner -. approves .-> req
  owner -. approves .-> intent
  owner -. "approves the plan once" .-> plan
  owner -. "approves one-way doors" .-> decision
  owner -. "decides on escalation" .-> reviewer
  owner -. "confirms, or types release I-n" .-> release
  owner -. "confirms, or types rollback I-n" .-> rollback

  next -. drives .-> plan
  next -. drives .-> card
  next -. drives .-> gate
  next -. drives .-> check
```

## What the plugin installs and what it writes into a project

```mermaid
flowchart LR
  subgraph plugin["Plugin, installed in Claude Code"]
    skill["Skill aidlc<br/>the lead's loop"]
    agents["Agents<br/>builder, reviewer, researcher"]
    hooks["Hooks<br/>guard, scope, secrets, model, docs,<br/>heartbeat, prompt, steer, status, denied"]
    cli["CLI engine<br/>config, profile, template, okf, grid,<br/>state, card, gate, deploy, hooks,<br/>board, retro, map, init, vocab, naming, contract, arch, packs, inception,<br/>construction"]
    templates["Templates<br/>AGENTS.md, CLAUDE.md, profile, CI,<br/>bundle with constitution, doc types<br/>with runbook"]
  end

  subgraph project["Your project, name neutral"]
    profile[".aidlc/profile.json<br/>modules, lanes, levels,<br/>rules, architecture, deploy"]
    bin[".aidlc/bin<br/>pinned copy of the CLI"]
    docs["docs/ OKF bundle<br/>constitution, requirements, intents,<br/>units, runbooks, design, decisions"]
    runtime[".git/aidlc<br/>cards, reports, reviews, heartbeats,<br/>reviewing, launches, ci, deploys,<br/>goes, prompts, stats, denials, never committed"]
    ci["CI<br/>aidlc check --ci"]
  end

  templates -- "init" --> profile
  templates -- "init; upgrade adds missing ones" --> docs
  cli -- "init, upgrade" --> bin
  skill -- "runs" --> bin
  hooks -- "call" --> bin
  agents -- "start, report, review record" --> bin
  ci -- "runs" --> bin
  bin -- "reads, validates" --> docs
  bin -- "reads" --> profile
  bin -- "derives state from" --> runtime
```

The CLI keeps working with the plugin uninstalled: the project's pinned copy, its docs and CI stay green on their own. A later MCP or A2A adapter can call the same engine ([decision 0006](docs/decisions/0006-engine-behind-adapters.md)).

## Read more

- [Principles](docs/constitution/principles.md): the ten rules every change is checked against.
- [Overview](docs/design/overview.md): goals, budgets, releases, repo layout.
- [Grid](docs/design/grid.md), [State](docs/design/state.md), [Verification](docs/design/verification.md), [Requirements and architecture checks](docs/design/architecture.md).
- [Deployment and operation](docs/design/operations.md): deploy check, release, smoke and rollback; the owner types `release I-<n>` or `rollback I-<n>` as the go.
- [CI on the base](docs/design/base-ci.md): with `ci.wait`, builders start only on a pushed base whose CI passed; a red base gets a fix unit first.
- [Roadmap](docs/roadmap/index.md): the milestone plans; the newest one is the current plan.

## License

[MIT](LICENSE)
