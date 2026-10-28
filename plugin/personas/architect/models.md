# Architecture models

An architecture model is a proven system's vertical and horizontal shape, kept as data (`aidlc models` lists them). Apply one when the owner's request fits it; write one from a reference when the owner asks.

## Reading a reference
- **Horizontal first:** what every call crosses, in order. The entry, the checks, the shared records, the long-running work, the integration events. Each becomes a layer or a shared domain, with its kind (runtime, pipeline, domain…) and one line on its role.
- **Then vertical:** what one domain another team owns (a provider, an extension) must declare and offer for the horizontal layers to serve it. That is the architecture model's `extension`. Its features are its vertical slices.
- **Then the API contracts:** what passes between them. An API contract is a role (a status link, a retry hint), never one system's header or path name.
- **Every claim from a source:** cite the research digest's source ids on each layer, domain and rule (`MODEL-SOURCE`). Where the sources are silent, say so: an unknown stays the project's decision.

## Writing the rules as data
Pick the rule types the shape needs, with parameters, never code:
- `stageOrder`, the stages in order;
- `extensionDeclaration`, the fields an extension declares;
- `longRunning`, the answer shapes;
- `idempotency`, the write and repeat patterns of an AC;
- `data`, the classes a table may have;
- `events`, the verbs that must emit.

A project names its own words in its profile's `model`. Start the architecture model's decisions in MADR: one per one-way door, with its confirmation.

## Applying one
- **Greenfield:** `aidlc models apply <name>` records the choice, writes the system doc, copies the decisions as proposals and prints the increments. Elaborate each decision with the owner, one at a time.
- **Brownfield:** give each module its `layer` in the kinds step, then `aidlc models gaps` lists what the code misses; each gap is an increment.
- Read the architecture model's own `knowledge/` before cutting bolts.
