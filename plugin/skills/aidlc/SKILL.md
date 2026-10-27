---
name: aidlc
description: Run the AI-DLC loop in this repo - set it up, elaborate intents and bolts with the owner, start builders and reviewers, merge. Use when the user starts or continues work, asks what is next, or wants a project set up.
---

# The loop
`aidlc` means `node .aidlc/bin/aidlc.mjs`.

1. Run `aidlc next`. It prints one action.
2. Do only that action, then `next` again.
3. Exit code 2: the owner decides. Run the owner command it names (or the status's upgrade) for their prompt, never as `!`. End the turn with their step alone, last: its badge (👉 or ⛔, no other) and **Your action**, numbered steps, the words to type in code. Nothing for them: end with ✅.

A refusal names its fix: apply it. On `escalate`, stop and tell the owner.

# Doing each action
- **elaborate, draft**: copy the template in `.aidlc/templates/docs/`. Ask the owner one question at a time, 2-3 options and your pick; write each answer in the doc before the next. Open points go under `# Open questions`. Give each doc its why. Run `aidlc check <file>` and commit.
- **build**: run `aidlc card B-<n>` per bolt, then every builder in one message: Agent, `subagent_type: aidlc-team:builder`, `model` the card's `Model:`, prompt `Build B-<n>.` (a hook adds the card).
- **fix round, restart**: as build, prompt starting `Fix round for B-<n>.` or `Continue B-<n> from its branch's last commit.`
- **review**: per focus `next` names, all in one message: Agent, `subagent_type: aidlc-team:reviewer`, `model` as `next` names it, prompt `Review B-<n>, focus <focus>.` or `Review I-<n>.` (a hook adds the card or brief).
- **wait**: end the turn; notices wake you.
- **merge**: run it; apply each finding's fix.
- **deploy check**: run it; a failure prints an `aidlc fix` line: fill in what failed, run it.
- **release, rollback**: owner steps (3). If the owner types `release I-<n>` or `rollback I-<n>`, run that command.
- **research**: one Agent, `subagent_type: aidlc-team:researcher`, `model` as `next` names it, prompt `Research <id>.` (a hook adds the brief). File the digest as it says, draft the decision, commit.

Agents record their own results; never relay them.

# Owner instructions
Record "Hold B-4" or "B-2 first" with `aidlc hold B-4` or `aidlc priority B-2 <n>`, never in chat memory. A run mode ("run unattended", "stop at X"): owner command `aidlc mode`. To ask what `next` did not: `aidlc hold B-<n> <the question>`; lift it only on their word. Research asked or no clear pick: `aidlc hold <id> research: <question>`. A stamp whose owner prompt `status` shows as ran is the owner's: never revert it.

# Setup
Without `.aidlc/profile.json`, ask the owner for the name, base branch, docs folder and each test level's run command, offering what you detect. Run `node ${CLAUDE_PLUGIN_ROOT}/cli/aidlc.mjs init --name <name> --base <branch> --bundle <dir> --run <level>=<command>…`, plus `--adopt` if the docs folder's `index.md` has `okf_version`. Exit 2 lists kept files: ask the owner before `--overwrite <path>`. Commit, then start the loop.
