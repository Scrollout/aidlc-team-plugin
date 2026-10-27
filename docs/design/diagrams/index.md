# Design

* [Bolt states](bolt-states.md) - A bolt's derived states and what moves it between them; drawn from state.transitions in cli.json.
* [Bundle types](bundle-types.md) - The bundle's doc types, the folder each lives in and the keys its schema requires; drawn from the bundle settings in cli.json.
* [Gate checks](gate-checks.md) - The codes the merge gate can refuse with, as cli.json declares them, each with its fix.
* [Intent states](intent-states.md) - An intent's derived states, from approval to release; drawn from state.intentTransitions in cli.json.
* [Kinds and layers](kinds.md) - What each module kind may depend on, and the layers inside a domain pointing inward; drawn from vocabulary.kindRules and layerRules in cli.json.
* [Naming grammar](naming-grammar.md) - Each kind of name, the template it is composed from and the tokens it needs; drawn from naming.grammar in cli.json.
* [Words by scale](canonical-model.md) - The canonical words, one per concept, grouped by the scale they name; drawn from the vocabulary in cli.json.
* [Workflow](workflow.md) - The pathways into an approved intent with the steps each requires, then a bolt from approval to merge and an intent from merge to release; drawn from the pathways and state transitions in cli.json.
