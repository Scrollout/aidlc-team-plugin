---
type: Design
title: Plugin words
description: The canonical words at the plugin scale, each with its one meaning, the AI-DLC term it maps to and where it is declared; drawn from the vocabulary in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Word | Meaning | AI-DLC term | Declared in |
|---|---|---|---|
| lane | quick, standard or full; decides which grid rows run | - | the profile's `lanes` |
| docs bundle | the docs folder in OKF, with its indexes and log | - | `docs/index.md` |
| merge gate | every check `aidlc merge` runs on a trial merge before it merges | - | `aidlc merge` |
| review | a reviewer's round on a bolt's diff in one focus, ending in a verdict | - | `aidlc review` |
| verdict | a review's outcome: pass, fix or escalate | - | `.git/aidlc/reviews/` |
| focus | what a review looks at: general, or a focus the profile maps globs to | - | profile `focus` |
| builder | the agent that builds one bolt from its card in its own worktree | - | `agents/builder.md` |
| reviewer | the agent that reviews one bolt in one focus | - | `agents/reviewer.md` |
| researcher | the agent that answers one open question with a cited digest | - | `agents/researcher.md` |
| worktree | a bolt's own checkout, on its branch | - | `bolt/B-<n>` |
| base | the branch bolts merge into | - | profile `base` |
| trailer | a line a merge commit carries: what was merged, reviewed, tested and proved | - | the merge commit |
| stamp | a key the CLI writes outside a doc's hash, such as an approval | - | front matter |
| board | the project board kept in step with the bundle | - | profile `board` |
| retro | what the refusals and fix rounds say, by binding | - | `aidlc retro` |
| AI model | the AI an agent runs on, with its effort | - | profile `models`, `efforts` |
| card | the generated brief one builder works from and one reviewer checks against | - | `aidlc card` |
| lead | the main session running the loop | - | the skill |
| owner | the human who approves, releases and rolls back | - | `human:` stamps |
