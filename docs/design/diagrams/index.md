# Design

* [Bolt states](bolt-states.md) - A bolt's derived states and what moves it between them; drawn from state.machines.bolt in cli.json.
* [CLI components](cli-components.md) - A C4 component view of the CLI, with its runtime, extensions, public entry, domains and foundation kits, and which uses which; drawn from the CLI's own imports.
* [Intent states](intent-states.md) - An intent's derived states, from approval to release; drawn from state.machines.intent in cli.json.
* [Kinds and layers](kinds.md) - What each module kind may depend on, and the layers inside a domain pointing inward; drawn from vocabulary.kindRules and layerRules in cli.json.
* [Logical view](logical.md) - The plugin's logical building blocks - the people and agents, what each block decides or produces along the AI-DLC rows, and the data they share - with no technology.
* [Runtime view](runtime.md) - One bolt from approval to release as a sequence - the lead, the hooks, the pinned CLI, a builder and a reviewer in their worktrees, git, CI and the owner.
* [Technical view](technical.md) - Where the plugin's parts run and how they connect - the coding agent and its hooks, the installed plugin, the CLI pinned in each project, the project's files and runtime store, and the outside systems.
* [Words by scale](canonical-model.md) - The canonical words, one per concept, grouped by the scale they name; drawn from the vocabulary in cli.json.
* [Workflow](workflow.md) - The pathways into an approved intent with the steps each requires, then a bolt from approval to merge and an intent from merge to release; drawn from the pathways and state transitions in cli.json.
