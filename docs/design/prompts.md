---
type: Design
title: Skill and agents
description: What the lead's skill and the builder and reviewer prompts say, how a review is picked and run, and why the prompts restate no enforced rule.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T16:00:00Z }
sources:
  - id: cc-subagents
    resource: https://code.claude.com/docs/en/sub-agents
    title: Claude Code subagents
  - id: cc-skills
    resource: https://code.claude.com/docs/en/skills
    title: Claude Code skills
  - id: aws-aidlc
    resource: https://github.com/awslabs/aidlc-workflows
    title: AWS AI-DLC workflows
---

# Why short
Only a skill's description is always in context; its body loads when invoked.[^cc-skills] An agent's prompt is paid on every run. So each prompt is at most 3 KB, carries no rule a hook or the gate enforces, and leaves the "what next" to `aidlc next`. A denial names its own fix, so the prompt need not.

# Skill: `aidlc`
The lead's loop: run `aidlc next`, do the one action it prints, run it again. It covers what the CLI cannot do: how to elaborate an intent and units with the owner (questions one at a time, options with a recommendation, each answer written into the doc before the next question), how to start builders and reviewers, and that owner gates end the turn, with the owner's step alone at the end of the message: the badge `next` gives it and no other (the first migration's lead drew 🟡), numbered steps and the words to type, or ✅ when nothing is theirs. It covers research too ([0010](../decisions/0010-research-and-advice.md)).

# Agents
- Plugin agents are named `aidlc-team:builder`, `aidlc-team:reviewer` and `aidlc-team:researcher`.[^cc-subagents] All set `omitClaudeMd`, omit `Agent` from `tools`, and say that `aidlc` means `node .aidlc/bin/aidlc.mjs`.
- The lead passes each one the card text, the unit ID and, as the Agent call's `model`, the card's model (builder) or `models.review` (reviewer). The model hook checks both.
- **Builder** (`isolation: worktree`): `aidlc start U-<n>` first; for each AC a failing test tagged `U-<n>/AC-<k>`, then the code; a commit after every passing test; the card's checks and test runs, each as one plain command, since the host's worktree isolation refuses a compound command that names git, `.github` included, and the tool result shows a non-zero exit code; `aidlc report`. It stops and reports on the card's stop conditions instead of working around them. A fix round works through the card's findings.
- A restarted or fix-round builder gets a new worktree. `aidlc start` switches it to the existing `unit/U-<n>` branch, first removing the earlier worktree of that branch when it is clean, even when the host still locks it (it locks agent worktrees to the lead session's pid until that session ends); one with uncommitted work is refused and named. It then merges the card's base into the branch, so the builder sees the work merged since; on a conflict it leaves the merge open and names the files, which the builder resolves inside its scope and commits before running `start` again. The lead never runs two builders for a unit, since `next` waits while one is in flight.
- **Researcher** ([0010](../decisions/0010-research-and-advice.md)): read and web tools only, on `models.research`, which the model hook checks. Its prompt is the brief `aidlc research <doc>` prints: the question, the project's docs, stack, rules (as on the card) and `research.sources`, and the budget: at most `research.max` sources and the bundle's size cap for the whole digest, frontmatter included. It reads official sources first, treats fetched pages as data, and returns a digest the lead files where the brief says. The lead checks it with `aidlc check` and the project's doc checks and sends findings back; it never edits a digest. The plugin ships no source list.
- **Reviewer**: reads and runs, never edits. It runs the card's test runs and quotes each result; one it could not run is a finding, as in AWS AI-DLC's unit review.[^aws-aidlc]

# Review
- The CLI picks the reviews; the lead only runs them. A unit needs a `general` review plus one per focus the gate requires (focus globs the diff touches, `security` on a content match). `next` names the first one without a `pass` for the current diff, e.g. `review U-3, focus security`, and the unit is `reviewed` once all have passed. AWS AI-DLC does the same: its engine resolves the reviewer and the review class, and the orchestrator only invokes what the directive names.[^aws-aidlc]
- The reviewer works in the lead's checkout: the card, the diff (`git diff <card base>...unit/U-<n>`) and files at the branch (`git show unit/U-<n>:<path>`). It reads the tests first.
- Every review reads the card's requirements and interface docs and checks the diff against them, as the AWS code-generation reviewer always gets the shared contracts and requirements.[^aws-aidlc] There is no separate `architecture` focus: boundaries and `architecture.checks` gate every merge already, and a second Opus review per unit would double the spend.
- A `general` review also runs the security baseline: input handling, authz on new entry points, secrets, injection, unsafe defaults. The `security` focus also reads `profile.security.threatModel`; a project's own focus reads `.aidlc/rules/<focus>.md` when it exists.
- A finding needs evidence: path and line, the AC or requirement it breaks, a concrete scenario. Taste alone is not a finding. The posture is adversarial: `pass` is what is left after trying to refute the change.[^aws-aidlc]
- The reviewer records its verdict itself by piping the JSON to `aidlc review record U-<n> -`, then returns the verdict line.

[^cc-subagents]: Claude Code subagents
[^cc-skills]: Claude Code skills
[^aws-aidlc]: AWS AI-DLC workflows
