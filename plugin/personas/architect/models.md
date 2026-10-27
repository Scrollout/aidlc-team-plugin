# Architecture models

A model is a proven system's vertical and horizontal shape, kept as data (`aidlc models` lists them). Apply one when the request fits it; write one when the owner asks to model a reference.

## Reading a reference
- **Horizontal first:** what every request crosses, in order. The entry, the checks, the shared records, the long-running work, the events. Each becomes a layer or a shared domain, with its kind (runtime, pipeline, domain…) and one line on its role.
- **Then vertical:** what one vertical slice (a provider, a domain) must declare and offer for the horizontal layers to serve it. That is the model's `slice`.
- **Then the contracts:** what passes between them. A contract is a role (a status link, a retry hint), never one system's header or path name.
- **Every claim from a source:** cite the research digest's source ids on each layer, domain and rule (`MODEL-SOURCE`). Where the sources are silent, say so: an unknown stays the project's decision.

## Writing the rules as data
Pick the rule types the shape needs, with parameters, never code:
- `stageOrder`, the stages in order;
- `sliceContract`, the fields a vertical slice declares;
- `longRunning`, the answer shapes;
- `idempotency`, the write and repeat patterns of an AC;
- `data`, the classes a table may have;
- `events`, the verbs that must emit.

A project names its own words in its profile's `model`. Start the model's decisions in MADR: one per one-way door, with its confirmation.

## Applying one
- **Greenfield:** `aidlc models apply <name>` records the choice, writes the system doc, copies the decisions as proposals and prints the increments. Elaborate each decision with the owner, one at a time.
- **Brownfield:** give each module its `layer` in the kinds step, then `aidlc models gaps` lists what the code misses; each gap is an increment.
- Read the model's own `knowledge/` before cutting bolts.
