---
type: Design
title: Overview
description: Goals, non-goals, budgets, repo layout and glossary of the plugin.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Goals
- Usable in any project: `init` renders a profile, AGENTS.md and an OKF bundle from templates.
- Deterministic: the CLI computes the next allowed step; hooks block rule breaks at the action.
- Cheap and fast: small always-on context, Sonnet builders, Opus only for review, lanes sized to risk.
- Autonomous: the owner approves intent, plan, one-way doors and release; agents do the rest.
- Extensible: rule layers (plugin, org, project, personal) and overridable templates.

# Non-goals
- Sandboxing the shell. The guard stops mistakes, not attackers.
- Built-in deployment pipelines. Operation commands come from the project profile.
- Simulated meetings (multi-agent debates, PM/tech-lead/architect personas).
- Tracking the plugin's own process with the plugin.

# Budgets (hard limits)
| Item | Limit |
|---|---|
| Always-on context added to a project session | 1,500 tokens |
| Generated AGENTS.md | 60 lines |
| SessionStart status injection | 1,000 chars |
| Skill body / agent prompt | 3 KB each |
| Skill and agent descriptions | 300 chars each |
| Unit card | 6,000 chars |
| CLI source (`plugin/bin`, `plugin/lib`) | 2,500 lines |
| Hook wall time | 300 ms typical, fail closed |

# Repo layout
- `plugin/.claude-plugin/plugin.json`: the only version number.
- `plugin/bin/aidlc.mjs`, `plugin/lib/*.mjs`: the CLI.
- `plugin/hooks/`: thin wrappers that call the CLI.
- `plugin/agents/`: `builder.md`, `reviewer.md`.
- `plugin/skills/aidlc/SKILL.md`: the lead's loop.
- `plugin/templates/`: everything `init` renders.
- `.claude-plugin/marketplace.json`: points at `./plugin`, so tests and docs never ship.

# Glossary
- **Intent:** a goal with its why and success measures.
- **Unit:** an independently buildable slice of an intent, with acceptance criteria (ACs) and a write scope.
- **Lane:** quick, standard or full; decides which grid rows run.
- **Card:** the generated brief for one unit.
- **Lead:** the main session running the loop. **Owner:** the human.
