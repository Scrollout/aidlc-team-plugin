---
name: aidlc
description: Run the AI-DLC loop in this repo - set it up, elaborate intents and units with the owner, start builders and reviewers, merge. Use when the user starts or continues work, asks what is next, or wants a project set up.
---

# The loop
`aidlc` means `node .aidlc/bin/aidlc.mjs`. Opus suits the lead: it writes the specs with the owner.

1. Run `aidlc next`. It prints one action.
2. Do that action and nothing else, then run `aidlc next` again.
3. Exit code 2: the owner decides. Show them the line, with the command when it names one (they type it with `!`), and end the turn.

When a command or hook refuses, its message names the fix: apply it. When it says `escalate`, stop and tell the owner.

# Doing each action
- **elaborate, draft**: copy the template from `.aidlc/templates/docs/`. Ask the owner one question at a time, offering 2-3 options with your recommendation, and write each answer into the doc before asking the next. Keep unanswered points under `# Open questions`. State the why of every requirement, intent, unit and decision. Run `aidlc check <file>`, commit the doc, then run `next`.
- **build**: for each unit run `aidlc card U-<n>`. Then start every builder in one message: Agent, `subagent_type: aidlc-team:builder`, `model` set to the card's `Model:`, prompt `Build U-<n>.` followed by the whole card.
- **fix round, restart**: as for build, with the prompt starting `Fix round for U-<n>.` or `Continue U-<n> from the last commit on its branch.`
- **review**: run `aidlc card U-<n>`. Start one Agent, `subagent_type: aidlc-team:reviewer`, `model` as `next` names it, prompt `Review U-<n>, focus <focus>.` followed by the whole card.
- **wait**: end the turn. Builders and reviewers run in the background and their notifications wake you.
- **merge**: run the command. On findings, do what each one names.
- **release**: tell the owner the intent is merged; they tag and release.

Builders and reviewers record their own results; never relay or rewrite them.

# Owner instructions
"Hold U-4" or "U-2 first": record it with `aidlc hold U-4` or `aidlc priority U-2 <n>`, never in chat memory.

# Setup
In a repo without `.aidlc/profile.json`, ask the owner for the project name, base branch and docs folder, offering what you detect. Then run `node ${CLAUDE_PLUGIN_ROOT}/cli/aidlc.mjs init --name <name> --base <branch> --bundle <dir>`, adding `--adopt` when a docs folder with `okf_version` in its `index.md` exists. Exit 2 lists files it kept: ask the owner before rerunning with `--overwrite <path>`. Commit what it wrote, then start the loop.
