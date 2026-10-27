# Changelog

All notable changes to the plugin are documented in this file. The docs bundle keeps its own history in `docs/log.md`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.185.0] - 2026-10-27
### Added
- The board labels each intent and bolt issue with the decisions its doc links, as `ADR-<NNNN>`; a label whose link is removed goes with it.

## [0.184.0] - 2026-10-27
### Added
- Decisions in MADR 4.0, completed: approving a decision sets `decision-makers` to the approver when the decision names no one, and `DOC-SCHEMA` reports a draft decision whose status MADR does not name (proposed, rejected, accepted, deprecated, superseded by ADR-<NNNN>).
- `models apply` dates each decision it copies, and the control-plane model's decisions carry their Consequences.

## [0.183.2] - 2026-10-27
### Changed
- The control-plane model's Go reference keeps its values (routes, error codes, statuses, event types, the providers it serves) in an embedded `values.json`, and its operations are read through a `getoperation` query slice; it passes `VALUE-LITERAL` and the slice checks, and a test holds it to them. The knowledge guide says what the reference covers and how a project adopts it.
- The Go and TypeScript packs list the common HTTP header names and the JSON media type as protocol.

## [0.183.1] - 2026-10-27
### Changed
- The lead's skill works in the role a step names (`aidlc persona <role>`) while elaborating, asks the owner for the naming tokens at setup and passes them to `init`, and says once that a hook adds each agent's card or brief.

## [0.183.0] - 2026-10-27
### Added
- Structured answers (M26 B239). `status`, `next`, `lane`, `graph`, `models` and `check` return their values as `data`, and their text is rendered from it. `next` serves its action as `{ command, args }`, the `aidlc` command its line names, from `state.actions`; an agent's or the owner's own step serves none.
- `--json` on any command prints the whole answer as one object, `{ code, findings, output, data }`, and an error with `error`; the exit code and the text form are unchanged.

## [0.182.1] - 2026-10-27
### Changed
- The lifecycle states are named in `state.names`, and the core and the extensions refer to them by that map, never as literals. The values guard reports a state name written as a literal even where it is also some key, and no longer needs the board template's keys.
- The stated minimum is Node 24, the lines CI tests.

## [0.182.0] - 2026-10-27
### Added
- No hard-coded data in projects (M26 B238). `VALUE-LITERAL` at the merge gate reports a string literal on a line a bolt adds to a source file, outside tests and the profile's `values.data` globs, with a letter in it, and neither on a line the stack pack skips nor allowed by the pack's or the profile's `values.allow`. Each stack pack names its string literal and its protocol; the profile's `values.literal` replaces the pattern.
- The project constitution's rule 12, Values in data; the builder keeps values in the project's data and the reviewer reports a literal one.

### Changed
- The extensions' gate checks receive the lines a bolt adds, and may report a line.
- CI tests on Node 24 and 26.

## [0.181.0] - 2026-10-27
### Added
- The board is a declarative template (M26 B237). `plugin/cli/extensions/board/board.json`, with a project's `.aidlc/templates/board.json` merged over it, gives each item kind's title, body, labels, assignees, type, milestone, parent and blocked-by path, and each Project field's type, source path, value map and options; the profile's `github` maps still apply over it.
- A bolt's `depends` sync as blocked-by links, added and removed to match the plan; links to issues off the board stay.
- Iteration fields are written by an iteration's title or start date; a missing field or declared option is created.
- Per-bolt assignees from `board.assignees`.

### Changed
- Labels and assignees the plugin set that the plan no longer gives are removed; ones people add stay.
- `sync` refuses, before any write, a Project field of the wrong type and a missing field the template gives no type.

## [0.180.0] - 2026-10-27
### Changed
- The extensions hold no hard-coded value (M26 B236). The intake's id patterns, the models' heading and partition patterns, long-running roles and joiners, the stacks' migration grammar, event-type rules and scaffold words, the deploy steps and the retro's hours live in each `extension.json`; each stack pack's manifest names how its language's imports are read and how it writes a string literal. `tests/values.test.mjs` now reads `plugin/cli/extensions/` too, with the board's API paths and the contract checks' OpenAPI words listed as protocol.

## [0.179.0] - 2026-10-27
### Changed
- The core holds no hard-coded value (M26 B235). Names, ids, doc grammars, thresholds, labels, levels, the action kinds and CI states, the naming registry's patterns and word forms all live in `cli.json`; the code holds logic, the protocol of the tools it calls, and keys into the data.
- A test reads every literal and number of `aidlc.mjs` and `lib/` and fails on one that is no data key, template variable, profile or front-matter key, or listed tool protocol (`tests/values.test.mjs`, `tests/fixtures/protocol.json`).
- M26 B239 narrowed: commands will answer with structured data, `--json` printing the whole answer and `next` its action as `{ command, args }`; a JSON-RPC adapter is left to an MCP adapter, if remote use is ever planned.

## [0.178.1] - 2026-10-27
### Changed
- The vocabulary follows the slice checks. The glossary names the **story** (one feature or use case, `US<g>.<s>`, which a vertical slice serves) and the **surface** (a domain's commands, queries and events); a vertical slice is declared as a folder of its domain's application layer, listed as a `Command` or `Query` line under the domain doc's `# Surface`.
- The product analyst writes stories with ids and groups them into units of work; the architect sorts kinds into vertical parts and horizontal layers, gives each domain its slices, and cuts bolts that deliver a slice whole.

## [0.178.0] - 2026-10-27
### Added
- With a naming registry, slices are named and routed by it at the merge gate: `SLICE-NAME` (a slice folder that is no name the registry composes from a verb and the domain's noun) and `SLICE-ROUTE` (an operation id used twice, one that maps to no slice folder or to no domain and verb, or a slice of a domain the contracts serve that no operation reaches).
- `SLICE-DELIVER`: a bolt that adds a slice must also change its domain's interface layer or a runtime, which wire its route, and the domain doc, which lists it.

## [0.177.0] - 2026-10-27
### Added
- Vertical slices checked at the merge gate, from the stack pack's graph, the folders, the domain doc and the tests: `SLICE-IMPORT` (a slice imports another), `SLICE-ENTRY` (a slice entered from outside its domain's interface layer or a runtime, or from nowhere), `SLICE-PLACE` (a file in no layer or no slice, an empty folder), `SLICE-SURFACE` (slice folders and the domain doc's commands and queries differ, or a slice names no use case), `SLICE-STORY` (a slice cites no story or an unknown one, or an approved unit of work's story has no slice) and `SLICE-TEST` (a slice with no test). A finding counts only where the bolt changed a file.
### Changed
- The domain template lists one slice per line under `# Surface`: `- Command <slice>: <use case> [I-<n>:US<g>.<s>]`, or `- Query`.

## [0.176.0] - 2026-10-27
### Added
- Units of work (method 11): an intent lists its units of work under `# Units`, as the method's Mob Elaboration and Units Generation give them. Each has a kind (`service`, `spec`, `ui`, `packaging` or `library`), the modules it changes, its responsibilities, stories, requirements, risks, measures citing the intent's success measures, and the units of work it depends on; integration, deployment, complexity, bolts and a PRFAQ are optional. Stories carry ids `US<g>.<s>` and success measures `M<k>`.
- `UNIT-WORK`, which blocks an intent's approval: a missing or malformed unit of work, a story with no id or in no unit of work, a unit of work with no story, a dependency circle, or a bolt whose modules no unit of work lists.
### Changed
- The glossary maps the method's Unit to the unit of work, and the domain to a Domain Design component.

## [0.175.0] - 2026-10-27
### Changed
- Vertical slices and horizontal layers take their standard meaning (decision 0024, superseding 0023). A **vertical slice** is the code of one business feature or use case, a command or a query, cutting through every horizontal layer it needs and naming the use case it serves. A **horizontal layer** groups code by one technical concern shared by every feature: the interface, application, model and infrastructure layers inside a domain, and the platform every request crosses. A **domain** is the bounded context holding a business capability's slices and its data; an **extension** is a domain another team owns. "Operation" and "internal layer" are retired.
- `aidlc name slice` and `aidlc scaffold slice` return, and the stack packs' `slice` templates with them.
- A model's vertical contract is its `extension` (rule type `extensionContract`), declared under each module's `declares`; a model's reference code is listed under `references`.
- The project constitution's rule 9: code is grouped into vertical slices across the horizontal layers, one slice never calls another slice's data layer directly, and each domain owns its data.
- The domain template asks each command and query for the business use case it serves.

## [0.174.0] - 2026-10-27
### Changed
- One layout for shipped content (decision 0022): the templates the CLI renders (cards, fix, research, intent review) join `plugin/templates/`, the personas move to `plugin/personas/`, the models to `plugin/models/`, and the control-plane model keeps its Go walking skeleton in `plugin/models/control-plane/reference/go/` with its own tests; the board's issue template lives in its extension.
- `init` and `upgrade` pin every package beside the CLI in `.aidlc/bin/<package>/` and remove the old `.aidlc/packs/`; a project file at the same path under `.aidlc/` still wins.
- One resolver, from `cli.json` `packages`, finds every template, persona, model and pack; the bolt template of `aidlc new bolt` now resolves through it in a pinned project too.

## [0.173.1] - 2026-10-27
### Changed
- The core's small modules take their values from `cli.json`: the extensions' folder, entry and data file, template labels, the slug and generated-block patterns, the list-item pattern of an architecture exception, and the default finding level (M26 B235, in part).
- `vocabulary.kindRules` is a structured object per kind, `{ any, surface }`, in place of `kind:surface` strings.

## [0.173.0] - 2026-10-27
### Changed
- The architecture words follow the method and the reference architecture (decision 0023). The glossary names the **vertical slice** (a domain or an extension that owns its data end to end and plugs into the horizontal layers through its contract), the **horizontal layer** (a runtime, pipeline, foundation or adapter every request crosses), the **core**, the **operation** (one command or query of a vertical slice) and the **internal layer** (interface, application, model, infrastructure, pointing inward).
- `aidlc name operation` and `aidlc scaffold operation` replace `name slice` and `scaffold slice`; the stack packs' `operation` templates replace their `slice` templates.
- The project constitution's rule 9 says vertical slices own their data and communicate only through published interfaces, events or shared domain services.
- Shipped messages and the models wording say "vertical slice" and "horizontal layer" in full.

## [0.172.2] - 2026-10-27
### Changed
- The project constitution's rule 9 states in plain terms that a domain never reaches into another domain's database and that domains communicate through their published interfaces, events or shared domain services.
- Code comments state each rule's reason in general terms.
- The control-plane model no longer lists a product name among its fit words.

## [0.172.1] - 2026-10-27
### Fixed
- Windows: the Agent hook still took 520-600 ms, over its 500 ms budget. It spawned git nine times; it now spawns it twice. The git common dir is asked once per folder in a process, and the card's freshness key reads the base and the bolt's branch from the repository's own files (`branchSha`).

## [0.172.0] - 2026-10-27
### Added
- The architect persona's knowledge of models: reading a reference horizontally then vertically, every claim from a source, writing its rules as data with each rule type the CLI knows, and applying a model to a new or an existing project. M24 Models is built.

## [0.171.0] - 2026-10-27
### Added
- The Go pack's reference holds the control-plane model's walking skeleton: a front door wiring the five governance stages in the model's order and routing by namespace, the resources domain (idempotent writes, a delete of an absent resource), the operations domain (status and terminal states), long-running writes answering with a result link and a retry hint, its OpenAPI document and events, each with Go tests; the model's `slices` name them. CI runs `go vet` and `go test ./...` on the reference on every OS, and a test holds the reference to the model's own rules and contract.

## [0.170.0] - 2026-10-27
### Fixed
- macOS: the traceability page found no tagged test when the merge ran in a temporary tree reached through a symlink (`/var` is `/private/var`); the bundle's path is now compared as a real path. CI on macOS was red on this since M19.
- Windows: the generated diagrams and the CLI's architecture self-check listed its files with backslashes; they are now posix paths. CI on Windows was red on this since M20.
- Windows: the Agent hook took about 700 ms to render the card at every launch, over the 500 ms budget; it now reuses the card `aidlc card` rendered while nothing the card is drawn from changed (base, branch, review and report, profile, templates, the CLI's version).

## [0.169.0] - 2026-10-27
### Added
- The control-plane model ships under `plugin/cli/models/control-plane/`, in generic names: a stateless front door and five governance stages in order (authenticate, authorize, policy, lock, throttle), four shared domains (resources, operations, deployments, activity), the provider slice per namespace, the six rules, its contract, five starter decisions in MADR, and the architect's knowledge for applying it.
### Changed
- Decision 0021 supersedes 0014: the contract grammar's resource hierarchy (the `providers` segment and its namespace, `systemData` on a resource, `nextLink` on a list) moves from the plugin's defaults into the control-plane model's contract, applied only where a project chose that model (the `modelContract` seam). A project without a model gets the generic grammar only.
### Fixed
- The namespace rule no longer reads the first path segment as following `providers` when no `providers` segment is set.
- The README's generated workflow, left uncommitted since 0.164.0, draws the brownfield and model pathways' steps again.

## [0.168.0] - 2026-10-27
### Added
- Applying a model: intake lists the models whose fit words the request holds; `aidlc models apply <name>` records the choice in the profile, writes the system doc from the template with the model's building blocks when there is none, copies the model's decisions into the bundle as proposals once, and prints increments along its layers; `aidlc models gaps` matches the modules (`modules[].layer`) to the chosen model's items and kinds and prints the missing ones as increments.
- The `modelFit` seam, from the models extension to intake.

## [0.167.0] - 2026-10-27
### Added
- Model rule types: a project chooses its model in the profile (`model.name`), and only the rules that model lists run, with the model's parameters and the profile's project names: stage order (`PIPELINE-ORDER`, the stages a pattern finds in the wiring file), slice contract (`PROVIDER-CONTRACT`), long-running operations (`LONG-RUNNING`, an OpenAPI operation's answer shapes and headers, and a delete's no-content answer), idempotency (`IDEMPOTENCY-AC`), data (`DATA-PARTITION`, each owned table's partition and class) and events (`EVENT-COVERAGE`).

## [0.166.0] - 2026-10-27
### Added
- The `model` pathway: an intent that names its `model:` and `research:` digests needs the digests filed and a current Model doc; `aidlc models doc <name>` writes the Model doc (`models/<name>.md`, generated, with the model's digest) for the owner to approve. Each layer, domain and rule of a project model cites a source of that research (`MODEL-SOURCE`).
- The `pathwaySteps` seam: an extension adds pathway steps.

## [0.165.0] - 2026-10-27
### Added
- Architecture models (decision 0020), in the new `models` extension: a model folder (`model.json`, `knowledge/`, `decisions/`) loads from the CLI's shipped `models/` and the project's `.aidlc/models/`, the project's own winning; `aidlc models` lists them, and `aidlc check` reports a model that breaks the format (`MODEL-FORMAT`).

## [0.164.0] - 2026-10-27
### Added
- Method 10: the brownfield pathway requires `business` (`# Business transactions`, each line naming a module or domain the profile or bundle knows) and `baseline` (`baseline: [F-<n>]` citing a passing platform fact for each test level's `run`, and `# Debt`); else `PATHWAY-SKIP`. M22 Intake is built.
### Changed
- The architect persona maps existing code, its business transactions and its baseline before cutting increments.

## [0.163.0] - 2026-10-27
### Added
- The `Agent` hook delivers each subagent's brief: it renders the card, the intent review brief or the research brief at launch and makes it the prompt (the lead's first line kept when it names the bolt), at the role's effort from the new profile key `efforts` (build `high`, review and research `medium`); the agents' front matter carries the same as a fallback.
- Review findings keep their ids per focus (`F-<k>`): a fix or escalate round answers each one the last round left open, listed again with its id or named in `fixed`, else it is refused; a pass answers them all. The card shows the ids.
- `GUARD-SUBAGENT`: a subagent runs only its role's `aidlc` commands (`hooks.subagentCommands`).
### Changed
- The skill starts agents with a one-line prompt (`Build B-<n>.`, `Review B-<n>, focus <f>.`, `Review I-<n>.`, `Research <id>.`); the hook adds the rest.

## [0.162.0] - 2026-10-27
### Added
- Method 9: an intent is reviewed before the owner approves it. `next` asks for the review, `aidlc review I-<n>` prints the reviewer's brief (the request, the intent and its requirements, and what to check), and `aidlc review record I-<n> -` with focus `intent` keeps the hash of the docs it read. The approval refuses without a review of the docs as they are now (`APPROVE-REVIEW`); the findings are listed for the owner at the approval and block nothing.

## [0.161.0] - 2026-10-27
### Added
- Method 8: a request whose role words name two or more kinds of user needs a persona each under `# Personas`, unless the intent says `onePersona: "<why>"` (`ELAB-PERSONA`); each persona has a story `As a <persona>, I want…, so that…` citing one of the intent's requirements (`ELAB-STORY`); persona lines need a source. Both block approval.
### Changed
- The intent template carries `# Personas` and `# Stories`.

## [0.160.0] - 2026-10-27
### Added
- Method 7: an intent settles each surface of the corner checklist (data in the intake extension) on its own line under `# Corners`, else `ELAB-CORNER`; an answer with a vague word is `ELAB-VAGUE`; the last question is a read-back the owner confirms as *looks correct*, else `ELAB-OPEN`. All block approval.
### Changed
- An answer of "not decided" keeps its question open (`ELAB-OPEN`) instead of reading as a bare answer.
- The intent template carries `# Questions` ending with the read-back, and `# Corners`; the elaboration checks have their own design doc.

## [0.159.0] - 2026-10-27
### Added
- Method 6: an intent names the owner's requests (`request: [Q-<n>]`); each goal line, story and draft requirement statement cites a source that resolves (a request sentence, an answered question, an assumption under `# Assumptions`, or a platform fact), else `CLAIM-SOURCE`; a request sentence nothing cites is `REQUEST-COVERAGE`. Both block approval.
### Changed
- The intent template carries `request`, `pathway`, `lane` and `# Assumptions`, and the requirement template a source; the product analyst keeps the request with `aidlc intake` and reads it as data.

## [0.158.0] - 2026-10-27
### Added
- `aidlc intake` keeps the owner's request word for word as `requests/Q-<n>`, each sentence with its id, and proposes the pathway, stack and lane from a band per factor (verification and risk words it measures, ambiguity, risk and assumptions the lead scores, each citing sentences), in the new `intake` extension.
- An intent's `lane` is a floor its bolts never run below.
### Changed
- `next`'s first step keeps the owner's request with `aidlc intake` before the intent is elaborated.

## [0.157.0] - 2026-10-27
### Added
- Role personas the lead works in while it elaborates: a product analyst and an architect, with their knowledge; `aidlc persona <role>`; `next` names the role on each elaborate step.

## [0.156.0] - 2026-10-27
### Changed
- `deploy`, `release`, `rollback` and `retro` move out of the core into the `operations` extension, with their messages and values; the core drops from 4,502 to 4,348 lines.

## [0.155.0] - 2026-10-27
### Changed
- A fresh `init` starts the project on v2: the profile gets a `system` and a system code from the project's name.
- The README is rebuilt around the generated workflow.

## [0.154.0] - 2026-10-27
### Changed
- The run reports are condensed into one lessons page, each lesson naming the rule that holds it.
### Removed
- The sixteen run reports and intervention logs.

## [0.153.0] - 2026-10-27
### Removed
- Ten exports nothing outside their module used; a test keeps it so.
### Added
- The v1 aliases carry an expiry (`grid.legacyUntil`), checked by a test.

## [0.152.0] - 2026-10-27
### Added
- An arc42 page for the plugin's architecture, with a generated C4 component view of the CLI.
### Changed
- The system template follows arc42's twelve sections; a draft system doc in a v2 project missing one is `DOC-SCHEMA`. The dependency and kind maps say they are C4 component views.

## [0.151.0] - 2026-10-27
### Added
- `init` writes a `CHANGELOG.md` in this format, and the plugin keeps its own.

## [0.150.0] - 2026-10-27
### Added
- Method 5: in a v2 project a draft AC that is not Given/When/Then is `PLAN-AC`, and a draft requirement not stated in an EARS pattern is `PLAN-REQ`.
### Changed
- The bolt, fix and requirement templates are written in those forms.

## [0.149.0] - 2026-10-27
### Changed
- Decisions follow MADR 4.0: its template, `status: accepted` and `date` on approval, `superseded by ADR-<NNNN>` on a successor.
### Added
- A draft decision in a v2 project lacking a MADR section, or a one-way door its Confirmation, is `DOC-SCHEMA`.

## [0.148.0] - 2026-10-27
### Changed
- Messages, fixes, usage, the skill, the agents and the templates say bolt for a work item and increment for a delivery step; a test keeps the old words out.

## [0.147.0] - 2026-10-27
### Added
- Every check code is documented on one generated page per code table, and a test holds the docs to the codes that exist.

## [0.146.0] - 2026-10-27
### Added
- Diagrams generated from the data the CLI enforces: words by scale, workflow, bolt and intent states, kinds and layers, bundle types, naming grammar.
### Removed
- The hand-drawn state and workflow diagrams.

## [0.145.0] - 2026-10-27
### Added
- A test runs `ARCH-KIND`, `ARCH-LAYER` and `ARCH-CYCLE` on the CLI's own file graph.
### Changed
- An extension may use a domain's published surface. The host's hook rules are a domain.

## [0.144.0] - 2026-10-27
### Changed
- The board, contracts and stacks are extensions under `plugin/cli/extensions/`, with their data in `extension.json`; they import only the library's entry.

## [0.143.0] - 2026-10-27
### Changed
- The state hub splits into approval, review and flow. The budget counts the core (4,800 lines) and each extension (400) on their own.

## [0.142.0] - 2026-10-27
### Added
- Seams, through which domains and extensions plug in; `lib/index.mjs` as the public entry.
### Fixed
- The five import cycles in the CLI.

## [0.141.0] - 2026-10-27
### Changed
- The CLI's modules move into layers: foundation kits, domains, and extensions.

## [0.140.0] - 2026-10-27
### Added
- Construction by proof (method 4): `BOLT-BIND`, `BOLT-SPAN`, `PROOF-AC`, `REVIEW-SECURITY`, `INCR-SKELETON`, `INCR-DONE`, `FIX-SHAPE`, `HATCH-EXPIRED`, a traceability page per intent, requirements delivered only by released tests, retro measures and `board.binding`.

## [0.139.0] - 2026-10-27
### Added
- A deterministic Inception (method 3): pathways, intent size, answered questions, domain checks and the context map, `aidlc fact`, decisions superseded never amended, `DESIGN-COHERENCE`, a recorded design review with `aidlc dispose`, and one-way doors approved one at a time.

## [0.138.0] - 2026-10-27
### Added
- Stack packs for Go and TypeScript: `aidlc graph`, `aidlc scaffold`, reference domains, `GRAPH-SELFTEST` and event-type checks.

## [0.137.0] - 2026-10-27
### Added
- `ARCH-KIND`, `ARCH-LAYER` and `ARCH-REACH` over the dependency graph.

## [0.136.0] - 2026-10-27
### Added
- `CONTRACT-NAME` on published OpenAPI documents.

## [0.135.0] - 2026-10-27
### Added
- The card lists the names a bolt will create.

## [0.134.0] - 2026-10-27
### Added
- A generated glossary and `TERM-SYNONYM` at the gate.

## [0.133.0] - 2026-10-27
### Added
- Naming rules generated from the registry at the gate.

## [0.132.0] - 2026-10-27
### Added
- `aidlc name <kind>`.

## [0.131.0] - 2026-10-27
### Added
- The naming registry and `PROFILE-NAMING`.

## [0.130.0] - 2026-10-27
### Changed
- The docs and templates speak the canonical model.

## [0.129.0] - 2026-10-27
### Changed
- A stale index or a broken link is an error on the base.

## [0.128.0] - 2026-10-27
### Added
- File names generated from titles (`DOC-SLUG`).

## [0.127.0] - 2026-10-27
### Added
- Bundle v2: schemas per doc type (`DOC-SCHEMA`) and generated docs with a digest (`DOC-GENERATED`).

## [0.126.0] - 2026-10-27
### Added
- The codebase map by kind.
### Removed
- The slices page.

## [0.125.0] - 2026-10-27
### Added
- Intents pinned to the method they are approved under.

## [0.124.0] - 2026-10-27
### Added
- Bolts `B-<n>` and `aidlc new bolt`.

## [0.123.0] - 2026-10-27
### Changed
- Intents ship increments `I-<n>.<k>`; `PLAN-INCREMENT` replaces the slice rule.

## [0.122.0] - 2026-10-27
### Added
- Profile v2: `system`, module kinds and surfaces.

## [0.121.0] - 2026-10-27
### Added
- The canonical vocabulary as data, with its glossary generated.

## [0.120.4] - 2026-10-26
### Changed
- The last release before this changelog. The history before it is in `docs/log.md` and the git tags.

[unreleased]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.185.0...HEAD
[0.185.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.184.0...v0.185.0
[0.184.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.183.2...v0.184.0
[0.183.2]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.183.1...v0.183.2
[0.183.1]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.183.0...v0.183.1
[0.183.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.182.1...v0.183.0
[0.182.1]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.182.0...v0.182.1
[0.182.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.181.0...v0.182.0
[0.181.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.180.0...v0.181.0
[0.180.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.179.0...v0.180.0
[0.179.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.178.1...v0.179.0
[0.178.1]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.178.0...v0.178.1
[0.178.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.177.0...v0.178.0
[0.177.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.176.0...v0.177.0
[0.176.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.175.0...v0.176.0
[0.175.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.174.0...v0.175.0
[0.174.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.173.1...v0.174.0
[0.173.1]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.173.0...v0.173.1
[0.173.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.172.2...v0.173.0
[0.172.2]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.172.1...v0.172.2
[0.172.1]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.172.0...v0.172.1
[0.172.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.171.0...v0.172.0
[0.171.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.170.0...v0.171.0
[0.170.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.169.0...v0.170.0
[0.169.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.168.0...v0.169.0
[0.168.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.167.0...v0.168.0
[0.167.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.166.0...v0.167.0
[0.166.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.165.0...v0.166.0
[0.165.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.164.0...v0.165.0
[0.164.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.163.0...v0.164.0
[0.163.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.162.0...v0.163.0
[0.162.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.161.0...v0.162.0
[0.161.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.160.0...v0.161.0
[0.160.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.159.0...v0.160.0
[0.159.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.158.0...v0.159.0
[0.158.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.157.0...v0.158.0
[0.157.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.156.0...v0.157.0
[0.156.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.155.0...v0.156.0
[0.155.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.154.0...v0.155.0
[0.154.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.153.0...v0.154.0
[0.153.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.152.0...v0.153.0
[0.152.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.151.0...v0.152.0
[0.151.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.150.0...v0.151.0
[0.150.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.149.0...v0.150.0
[0.149.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.148.0...v0.149.0
[0.148.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.147.0...v0.148.0
[0.147.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.146.0...v0.147.0
[0.146.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.145.0...v0.146.0
[0.145.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.144.0...v0.145.0
[0.144.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.143.0...v0.144.0
[0.143.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.142.0...v0.143.0
[0.142.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.141.0...v0.142.0
[0.141.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.140.0...v0.141.0
[0.140.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.139.0...v0.140.0
[0.139.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.138.0...v0.139.0
[0.138.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.137.0...v0.138.0
[0.137.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.136.0...v0.137.0
[0.136.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.135.0...v0.136.0
[0.135.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.134.0...v0.135.0
[0.134.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.133.0...v0.134.0
[0.133.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.132.0...v0.133.0
[0.132.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.131.0...v0.132.0
[0.131.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.130.0...v0.131.0
[0.130.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.129.0...v0.130.0
[0.129.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.128.0...v0.129.0
[0.128.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.127.0...v0.128.0
[0.127.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.126.0...v0.127.0
[0.126.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.125.0...v0.126.0
[0.125.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.124.0...v0.125.0
[0.124.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.123.0...v0.124.0
[0.123.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.122.0...v0.123.0
[0.122.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.121.0...v0.122.0
[0.121.0]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.120.4...v0.121.0
[0.120.4]: https://github.com/Scrollout/aidlc-team-plugin/releases/tag/v0.120.4
