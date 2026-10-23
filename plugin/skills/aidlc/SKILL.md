---
name: aidlc
description: Run the AI-DLC loop in this repo - set it up, elaborate intents and units with the owner, start builders and reviewers, merge. Use when the user starts or continues work, asks what is next, or wants a project set up.
---

# The loop
`aidlc` means `node .aidlc/bin/aidlc.mjs`.

1. Run `aidlc next`. It prints one action.
2. Do that action and nothing else, then run `aidlc next` again.
3. Exit code 2: the owner decides. When the line names an owner command, run it: the owner answers its prompt. Else show them the line and end the turn.

When a command or hook refuses, its message names the fix: apply it. When it says `escalate`, stop and tell the owner.

# Doing each action
- **elaborate, draft**: copy the template from `.aidlc/templates/docs/`. Ask the owner one question at a time, offering 2-3 options with your recommendation; write each answer into the doc before the next. Keep unanswered points under `# Open questions`. State the why of every doc. Run `aidlc check <file>`, commit the doc, then run `next`.
- **build**: for each unit run `aidlc card U-<n>`. Then start every builder in one message: Agent, `subagent_type: aidlc-team:builder`, `model` set to the card's `Model:`, prompt `Build U-<n>.` followed by the whole card.
- **fix round, restart**: as for build, with the prompt starting `Fix round for U-<n>.` or `Continue U-<n> from the last commit on its branch.`
- **review**: run `aidlc card U-<n>`. Start one Agent, `subagent_type: aidlc-team:reviewer`, `model` as `next` names it, prompt `Review U-<n>, focus <focus>.` followed by the whole card.
- **wait**: end the turn; agent notices wake you.
- **merge**: run the command; apply each finding's fix.
- **research**: `aidlc research <id>` prints the brief; start one Agent, `subagent_type: aidlc-team:researcher`, `model` as `next` names it, the brief as prompt. File the digest as the brief says, draft the decision from it, commit both at once.
- **release**: tell the owner; they tag and release.

Agents record their own results; never relay or rewrite them.

# Owner instructions
"Hold U-4" or "U-2 first": record it with `aidlc hold U-4` or `aidlc priority U-2 <n>`, never in chat memory. A run mode ("run unattended", "stop at X", "report to Y") is the owner command `aidlc mode`; `status` shows it after a clear. When you park a step to ask the owner something `next` did not, run `aidlc hold U-<n> <the question>`; release it only on their word. Research asked, or no option clearly best: `aidlc hold <id> research: <question>`. A stamp whose owner prompt `status` shows as ran is the owner's: never revert it.

# Setup
In a repo without `.aidlc/profile.json`, ask the owner for the project name, base branch and docs folder, offering what you detect. Then run `node ${CLAUDE_PLUGIN_ROOT}/cli/aidlc.mjs init --name <name> --base <branch> --bundle <dir>`, adding `--adopt` for a docs folder whose `index.md` has `okf_version`. Exit 2 lists files it kept: ask the owner before rerunning with `--overwrite <path>`. Commit what it wrote, then start the loop.
