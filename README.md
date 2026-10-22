# aidlc-team

A Claude Code plugin that runs the AI-DLC lifecycle (Inception, Construction, Operations) in any project. It uses an OKF docs bundle and a small team of agents, and every rule that matters is enforced by a CLI or a hook, not by prose.

```
/plugin marketplace add Scrollout/aidlc-team-plugin
/plugin install aidlc-team@aidlc-team
```

## How AI-DLC runs with the plugin

```mermaid
flowchart TB
  owner(["Owner"])
  next{{"aidlc next<br/>one action, derived from git + docs"}}

  subgraph inception["Inception: owner and lead"]
    req["Requirements R-n<br/>lasting, approved"]
    intent["Intent I-n<br/>goal, why, success measures"]
    plan["Plan: units U-n<br/>ACs with test levels, scope,<br/>depends, reservations"]
    req --> intent --> plan
  end

  subgraph construction["Construction: per unit, in parallel worktrees"]
    card["Card<br/>rendered from the base commit"]
    builder["Builder<br/>tests first, only inside scope"]
    reviewer["Reviewer<br/>fresh context, JSON verdict"]
    gate{"Merge gate<br/>scope, AC tests, checks,<br/>review, OKF, security, architecture"}
    card --> builder --> reviewer
    reviewer -- "fix, at most 2 rounds" --> builder
    reviewer -- pass --> gate
  end

  subgraph operations["Operations"]
    base["Base branch<br/>merges carry Unit, Card, Review trailers"]
    release["Release tag"]
    base --> release
  end

  plan --> card
  gate -- "merge --no-ff" --> base

  owner -. approves .-> req
  owner -. approves .-> intent
  owner -. "approves the plan once" .-> plan
  owner -. "approves one-way doors" .-> decision["Decisions"]
  owner -. "decides on escalation" .-> reviewer
  owner -. approves .-> release

  next -. drives .-> plan
  next -. drives .-> card
  next -. drives .-> gate
```

## What the plugin installs and what it writes into a project

```mermaid
flowchart LR
  subgraph plugin["Plugin, installed in Claude Code"]
    skill["Skill aidlc<br/>the lead's loop"]
    agents["Agents<br/>builder, reviewer"]
    hooks["Hooks<br/>guard, scope, secrets, model,<br/>docs, steer, status, heartbeat"]
    cli["CLI engine<br/>profile, template, okf, grid,<br/>state, card, gate, hooks, init"]
    templates["Templates<br/>AGENTS.md, bundle, doc types, CI"]
  end

  subgraph project["Your project, name neutral"]
    profile[".aidlc/profile.json<br/>modules, lanes, levels,<br/>rules, architecture"]
    bin[".aidlc/bin<br/>pinned copy of the CLI"]
    docs["docs/ OKF bundle<br/>requirements, intents, units,<br/>design, decisions"]
    runtime[".git/aidlc<br/>cards, reports, verdicts,<br/>heartbeats, never committed"]
    ci["CI<br/>aidlc check --ci"]
  end

  templates -- "init" --> profile
  templates -- "init" --> docs
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
- [M1 plan](docs/roadmap/m1.md): units, acceptance criteria and what is built.

## License

[MIT](LICENSE)
