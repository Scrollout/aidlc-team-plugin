---
type: Design
title: Team
description: The five roles, how parallel worktree workers are run and merged, and where tokens are spent.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T09:20:00Z }
sources:
  - id: cc-subagents
    resource: https://code.claude.com/docs/en/sub-agents
    title: Claude Code subagents
---

# Roles
| Role | Who | Does | Never |
|---|---|---|---|
| Owner | the human | approves intent, plan, one-way doors, release; answers clarifying questions | reviews every line |
| Lead | main session + `aidlc` skill | runs `next`, writes intent/bolt/design docs, starts builders and reviewers, merges | writes production code on the base branch |
| Builder | subagent, Sonnet, `isolation: worktree` | builds one bolt from its card, test first; reports | edits outside scope, changes interfaces, approves |
| Reviewer | subagent, Opus, fresh context | checks the diff against the card and linked specs; returns findings | edits files |
| Researcher | subagent, Sonnet, fresh context, on a held question | a cited digest, official sources first | decides, writes files |

The owner holds both leads of the AI-DLC diagram: product behaviour (Inception) and software system (Construction).

# Specialists
The reviewer prompt takes a `focus`: `general`, `security`, `data`, `ui`, or any focus a project defines. The profile maps globs to focuses (e.g. `internal/auth/**` → security). A bolt whose scope or diff matches gets one extra review per matching focus; `next` names each focus in turn ([Skill and agents](prompts.md)). These are the AI-DLC team's internal consultants, called on demand, never permanent.

Every general review also runs a short security baseline (input handling, authz on new entry points, secrets, injection, unsafe defaults); the dedicated security focus goes deeper and reads the project's threat model.

# Parallel work
How builders run side by side in worktrees and are merged: [Parallel builders](parallel.md).

# Model routing
The CLI picks the AI model; the lead passes it as the Agent call's per-invocation `model`, which takes precedence over the agent's frontmatter.[^cc-subagents] A PreToolUse hook on the `Agent` tool denies a builder, reviewer or researcher started with another AI model than the card, `models.review` or `models.research` names. An environment that sets `CLAUDE_CODE_SUBAGENT_MODEL` with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides routing; reporting it is [Later](../roadmap/later.md).
| Work | Default | Escalates to Opus when |
|---|---|---|
| Source, quick lane | Sonnet | - |
| Source, standard lane | Sonnet | bolt spans 2+ modules, has 6+ ACs, or matches a `complex` glob (concurrency, migrations, API contracts) |
| Source, full lane | Opus | - |
| Fix round after a reviewer `fix` | as the bolt | the last `general` fix has a CONFIRMED finding: the round runs on Opus |
| Review, specialists | Opus | - |

Thresholds and the table live in `profile.models`, so a project can shift the balance. The lead runs on the AI model the owner chose; Opus suits it, since the lead writes the design rows with the owner.

# Cost
- Builders default to Sonnet; Opus where the table above says so.
- Quick lane: no reviewer; the report makes the bolt ready to merge, and the merge trailer says `Review: none`. Standard: one review. Full: one review plus specialists.
- Reviews are cached by diff hash; an unchanged diff is never reviewed twice.
- Each subagent loads only its card and linked docs; it never inherits the lead's conversation.
- Parallelism multiplies spend; `parallel.max` is a cost dial, not a speed setting.

[^cc-subagents]: Claude Code subagents
