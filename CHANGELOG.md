# Changelog

All notable changes to the plugin are documented in this file. The docs bundle keeps its own history in `docs/log.md`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- The pilot reports are condensed into one lessons page, each lesson naming the rule that holds it.
### Removed
- The sixteen pilot reports and intervention logs.

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

[unreleased]: https://github.com/Scrollout/aidlc-team-plugin/compare/v0.167.0...HEAD
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
