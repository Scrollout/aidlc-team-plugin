# Design

* [Bolt states](bolt-states.md) - A bolt's derived states and what moves it between them; drawn from state.transitions in cli.json.
* [Bundle types](bundle-types.md) - The bundle's doc types, the folder each lives in and the keys its schema requires; drawn from the bundle settings in cli.json.
* [CLI components](cli-components.md) - A C4 component view of the CLI, with its runtime, extensions, public entry, domains and foundation kits, and which uses which; drawn from the CLI's own imports.
* [Docs check codes](codes-bundle.md) - Every code the docs check reports, with its fix (a warning is marked); drawn from okf.codes in cli.json and the extensions' data.
* [Gate codes](codes-gate.md) - Every code the merge gate reports, with its fix (a warning is marked); drawn from gate.codes in cli.json and the extensions' data.
* [Hook codes](codes-hooks.md) - Every code the hooks reports, with its fix (a warning is marked); drawn from hooks.codes in cli.json and the extensions' data.
* [Intent states](intent-states.md) - An intent's derived states, from approval to release; drawn from state.intentTransitions in cli.json.
* [Kinds and layers](kinds.md) - What each module kind may depend on, and the layers inside a domain pointing inward; drawn from vocabulary.kindRules and layerRules in cli.json.
* [Naming grammar](naming-grammar.md) - Each kind of name, the template it is composed from and the tokens it needs; drawn from naming.grammar in cli.json.
* [Plan lint codes](codes-plan.md) - Every code plan lint reports, with its fix (a warning is marked); drawn from grid.codes in cli.json and the extensions' data.
* [Words by scale](canonical-model.md) - The canonical words, one per concept, grouped by the scale they name; drawn from the vocabulary in cli.json.
* [Workflow](workflow.md) - The pathways into an approved intent with the steps each requires, then a bolt from approval to merge and an intent from merge to release; drawn from the pathways and state transitions in cli.json.
