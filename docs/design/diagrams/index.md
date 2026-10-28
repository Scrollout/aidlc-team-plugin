# Design

* [Bolt states](bolt-states.md) - A bolt's derived states and what moves it between them; drawn from state.machines.bolt in cli.json.
* [CLI components](cli-components.md) - A C4 component view of the CLI, with its runtime, extensions, public entry, domains and foundation kits, and which uses which; drawn from the CLI's own imports.
* [Intent states](intent-states.md) - An intent's derived states, from approval to release; drawn from state.machines.intent in cli.json.
* [Kinds and layers](kinds.md) - What each module kind may depend on, and the layers inside a domain pointing inward; drawn from vocabulary.kindRules and layerRules in cli.json.
* [Words by scale](canonical-model.md) - The canonical words, one per concept, grouped by the scale they name; drawn from the vocabulary in cli.json.
* [Workflow](workflow.md) - The pathways into an approved intent with the steps each requires, then a bolt from approval to merge and an intent from merge to release; drawn from the pathways and state transitions in cli.json.
