---
name: aidlc
description: Run the AI-DLC loop in this repo - set it up, elaborate intents and units with the owner, start builders and reviewers, merge. Use when the user starts or continues work, asks what is next, or wants a project set up.
---

# The loop
`aidlc` means `node .aidlc/bin/aidlc.mjs`.

1. Run `aidlc next`. It prints one action.
2. Do only that action, then run `next` again.
3. Exit code 2: the owner decides. Run an owner command the line names; they answer its prompt. End the turn with their step alone, last: the line's badge and **Your action**, numbered steps, the words to type in code. Nothing for them: end with ✅.

A refusal names its fix: apply it. On `escalate`, stop and tell the owner.

# Doing each action
- **elaborate, draft**: copy the template in `.aidlc/templates/docs/`. Ask the owner one question at a time, with 2-3 options and your pick; write each answer in the doc before the next. Open points go under `# Open questions`. Give each doc its why. Run `aidlc check <file>` and commit.
- **build**: run `aidlc card U-<n>` per unit, then start every builder in one message: Agent, `subagent_type: aidlc-team:builder`, `model` the card's `Model:`, prompt `Build U-<n>.` then the whole card.
- **fix round, restart**: as build, the prompt starting `Fix round for U-<n>.` or `Continue U-<n> from its branch's last commit.`
- **review**: run `aidlc card U-<n>`, then one Agent, `subagent_type: aidlc-team:reviewer`, `model` as `next` names it, prompt `Review U-<n>, focus <focus>.` then the whole card.
- **wait**: end the turn; agent notices wake you.
- **merge**: run the command; apply each finding's fix.
- **deploy check**: run it. A failed check or smoke prints an `aidlc fix` line: fill in what failed and run it.
- **release, rollback**: owner steps (3). If the owner types `release I-<n>` or `rollback I-<n>`, run that command.
- **research**: `aidlc research <id>` prints the brief; then one Agent, `subagent_type: aidlc-team:researcher`, `model` as `next` names it, the brief as prompt. File the digest as it says, draft the decision, commit both.

Agents record their own results; never relay or rewrite them.

# Owner instructions
Record "Hold U-4" or "U-2 first" with `aidlc hold U-4` or `aidlc priority U-2 <n>`, never in chat memory. A run mode ("run unattended", "stop at X"): owner command `aidlc mode`. Parking a step to ask what `next` did not: `aidlc hold U-<n> <the question>`; lift it only on their word. Research asked, or no clear pick: `aidlc hold <id> research: <question>`. A stamp whose owner prompt `status` shows as ran is the owner's: never revert it.

# Setup
Without `.aidlc/profile.json`, ask the owner for the name, base branch, docs folder and each test level's run command, offering what you detect. Run `node ${CLAUDE_PLUGIN_ROOT}/cli/aidlc.mjs init --name <name> --base <branch> --bundle <dir> --run <level>=<command>…`, plus `--adopt` if the docs folder's `index.md` has `okf_version`. Exit 2 lists kept files: ask the owner before `--overwrite <path>`. Commit, then start the loop.
