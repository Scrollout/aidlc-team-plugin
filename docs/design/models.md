---
type: Design
title: Models
description: architecture models as data - a proven system's vertical and horizontal shape distilled from research, shipped or kept by a project, applied to new and existing projects by the AI-DLC method, and held by generic rule types.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T20:00:00Z }
---

# Why
A new project starts from a proven shape, and an existing one is measured against it ([0020](../decisions/0020-architecture-models-are-data.md)).

# The pipeline
1. **Reverse-engineer a reference:** research a proven system, and observe it where the sources are silent. The evidence stays with the owner.
2. **Distil a model:** its horizontal layers and the domains that plug into them, as data.
3. **Apply the model** to a project with the AI-DLC method: proposed at intake, seeded as decisions the owner approves, cut into increments, held by the checks.

# A model
A folder, `models/<name>/`:
- `model.json`:
  - `layers`: the horizontal layers, in order, each with its kind and its role;
  - `domains`: the shared domains the others rely on;
  - `extension`: what each extension declares and must offer;
  - `contracts`: what passes between layers and domains;
  - `rules`: rule types with their parameters;
  - `decisions`: the starter decisions;
  - `fit`: the signals intake matches;
  - `references`: the reference code per stack pack.
- `knowledge/`: what the architect persona reads to apply the model.
- `decisions/`: starter decisions in MADR, proposed until the owner approves each one.

A model's rules name roles and shapes, never one vendor's names; the project's own contract fills those in.

# Where models live
- Shipped in `plugin/models/<name>/` with its reference code, pinned with the CLI ([Shipped layout](layout.md)).
- A project or organisation adds or overrides one in `.aidlc/models/<name>/`; the local one wins.
- `aidlc check` validates every model it can see.

# Modelling a reference
The `model` pathway, for an intent that names its `model:` and its `research:` digests:
1. **`research`:** the researcher's cited digests of the reference, filed under `research/`.
2. **The draft:** the architect persona writes `.aidlc/models/<name>/model.json`. Each layer, domain and rule carries `sources`: ids of the digests' sources. One with none, or with an id no digest has, is `MODEL-SOURCE`.
3. **`modelDoc`:** `aidlc models doc <name>` writes the Model doc, `models/<name>.md`, from it: the layers, domains, extension, contracts and rules, each with its sources as footnotes, and `digest`, the hash of `model.json`. Only the CLI writes it, so a stale or hand-edited doc fails the step.
4. **The approval:** the owner approves the Model doc like any doc, and re-approves it after the model changes. The model's one-way doors are approved one at a time when it is applied.

Shipped models carry no sources: a plugin release vouches for them.

# Applying a model
- **Greenfield:** intake lists the models whose `fit.words` appear in the request, with their sentences. Once the owner picks one, `aidlc models apply <name>`:
  - records it in the profile (`model.name`);
  - writes the system doc from the template, its layers and domains under `# Building Block View`, when the bundle has none;
  - copies the model's decisions into `decisions/` as proposals, numbered on, for the owner to approve one at a time;
  - prints the increments along its layers, the walking skeleton through every layer first.

  Applying again copies nothing twice.
- **Brownfield:** each module names the item it plays (`modules[].layer`, in the `kinds` step). `aidlc models gaps` lists the items played, those missing and those played by a module of another kind; the missing ones are printed as the intent's increments.

# Rule types
A project chooses its model in the profile (`model.name`), and only that model's rules run, with its parameters and the project's own names from the profile's `model`, so no vendor's names live in the plugin.

| Type | Model parameters | Project's `model` | Checks | Code |
|---|---|---|---|---|
| `stageOrder` | `stages` | `wiring: { file, pattern }` | the stage names the pattern finds in the file come in the model's order, none missing | `PIPELINE-ORDER` |
| `extensionContract` | `kind`, `declares` | each module's `declares` | every module of that kind declares each field | `PROVIDER-CONTRACT` |
| `longRunning` | `shapes` (`code`, `links`), `deleteAbsent` | `operations: { marker, status, result, retry }` | an OpenAPI operation the marker flags answers in a shape with its link and retry headers; a delete answers `deleteAbsent` | `LONG-RUNNING` |
| `idempotency` | `writes`, `repeat` | - | a bolt with an AC matching `writes` has one matching `repeat` | `IDEMPOTENCY-AC` |
| `data` | `classes` | - | each table under a domain's `# Owns` declares `(partition: <key>, class: <class>)` | `DATA-PARTITION` |
| `events` | `verbs` | `events: { marker, files }` | each OpenAPI operation of those verbs names events by the marker, each found in the events files | `EVENT-COVERAGE` |

The OpenAPI files are the contracts'.

# The first model: control plane
- **Layers:** a front door; governance (authenticate, authorize, policy, lock, throttle); resource metadata; operations; deployments; events and an activity log.
- **Extension:** a provider per namespace, its resource types, and whether each type's writes are long-running.
- **Rules:** the stage order; long-running operations; idempotent writes; deployments that converge by re-applying, without compensation unless a project decides otherwise.
- **Contract:** the resource hierarchy the contract grammar adds for it: the `providers` segment and its namespace, `systemData` on a resource, `nextLink` on a list ([0021](../decisions/0021-the-control-planes-api-conventions-belong-to-its.md)).
- **First applied** to an existing control-plane project (M21).

Bolts: [M24](../roadmap/m24.md) B228, B229, B230, B231, B232, B233, B234.
