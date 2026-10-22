---
type: Design
title: Overview
description: Goals, non-goals, budgets, repo layout and glossary of the plugin.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
sources:
  - id: cc-host
    resource: https://code.claude.com/docs/en/plugins/host-marketplace
    title: Host and maintain a marketplace
  - id: cc-tag
    resource: https://code.claude.com/docs/en/plugins/cli-reference#plugin-tag
    title: Plugin commands reference, plugin tag
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
| CLI source (`plugin/cli/`) | 2,500 lines |
| Hook timeout | 10 s explicit, `onFailure: "block"` on blocking hooks |

# Repo layout
- `plugin/.claude-plugin/plugin.json`: `name` is `aidlc-team` (kebab-case, no reserved prefix, and never `aidlc`, which projects use for the CLI and `.aidlc/`), the only `version`; users stay on a version until it is bumped.
- `plugin/cli/aidlc.mjs`, `plugin/cli/lib/*.mjs`: the CLI.
- `plugin/hooks/`: thin wrappers that call the CLI.
- `plugin/agents/`: `builder.md`, `reviewer.md`.
- `plugin/skills/aidlc/SKILL.md`: the lead's loop.
- `plugin/templates/`: everything `init` renders.
- `.claude-plugin/marketplace.json`: marketplace `scrollout`, one entry `aidlc-team` with `source: "./plugin"`, so tests and docs never ship. Install id: `aidlc-team@scrollout`.

# Releases
- `version` lives only in `plugin/.claude-plugin/plugin.json`, never in the marketplace entry. Users stay on a version until it changes.[^cc-host]
- A release carries two annotated tags on the same commit, chosen by the owner:
  - `v<version>`, the standard semver tag for people and GitHub Releases.
  - `aidlc-team--v<version>`, made by `claude plugin tag plugin --push`. The command first checks that the manifest and the marketplace entry agree and that the tree is clean.[^cc-tag] Plugin dependency ranges resolve against this form.
- The version always matches a tag. A commit that changes `plugin/` also bumps `version` (semver: new commands or rules are minor, fixes are patch), and is tagged once it is on `main`. A test fails when `plugin/` differs from the tag of the current version. CI checks on a tag push that either tag matches `plugin.json`. The owner approves each release (principle 5).
- Users can pin a release with `/plugin marketplace add Scrollout/aidlc-team-plugin#v<version>`.[^cc-host]
- The vendored CLI's `VERSION` file holds the same version, so a project records which release judges it.

# Glossary
- **Intent:** a goal with its why and success measures.
- **Unit:** an independently buildable slice of an intent, with acceptance criteria (ACs) and a write scope.
- **Lane:** quick, standard or full; decides which grid rows run.
- **Card:** the generated brief for one unit.
- **Lead:** the main session running the loop. **Owner:** the human.

[^cc-host]: Host and maintain a marketplace
[^cc-tag]: Plugin commands reference, plugin tag
