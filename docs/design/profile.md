---
type: Design
title: Profile and templates
description: The project profile, rule layers, the template engine and what init renders and reports.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T21:50:00Z }
---

# Profile (`.aidlc/profile.json`, tracked)
```json
{
  "name": "example",
  "base": "main",
  "docs": { "bundle": "docs" },
  "levels": { "unit": { "paths": ["**/*_test.go"], "run": "make test" }, "integration": { "paths": ["tests/integration/**"], "run": "make it" } },
  "modules": [
    { "id": "api", "paths": ["internal/**", "cmd/**"], "check": "make test", "data": ["data/orders"] },
    { "id": "contracts", "paths": ["api-specs/**"], "check": "make contract-check" }
  ],
  "lanes": { "quick": ["docs/**", "*.md"], "full": ["migrations/**", "api-specs/**"] },
  "focus": { "security": ["internal/auth/**", "**/rls*"], "data": ["migrations/**"] },
  "security": { "secrets": ["\\bACME-[0-9A-F]{32}\\b"], "content": ["BYPASSRLS", "InsecureSkipVerify"], "threatModel": "docs/threat-model.md", "check": ["make scan"] },
  "reserve": { "migration": { "dir": "migrations/{area}", "pattern": "{n:4}_*.sql" } },
  "parallel": { "max": 3 },
  "architecture": { "graph": "make deps-graph", "boundaries": [{ "from": "internal/core/**", "deny": ["internal/providers/**"] }], "data": { "prefix": "data/", "shared": ["data/outbox"] }, "checks": ["make contract-check"] },
  "adopted": "<commit where init --adopt ran>",
  "deploy": { "check": ["make image"] },
  "release": "make release"
}
```

# Rule layers
Merged in order, later wins, except that a `deny` in an earlier layer cannot be removed (`cli.json` `layers`):
1. plugin defaults (`plugin/cli/defaults.json`: base, bundle, parallel, research, review, levels, models, board, ci, plan), beside the CLI so a project's pinned copy carries them
2. project: `.aidlc/profile.json`, `.aidlc/rules/*.md`
3. personal: `.aidlc/local/profile.json` (untracked); only this layer may delegate approvals ([0008](../decisions/0008-delegated-approvals.md))

An org layer (a pinned git repo of rules) is [Later](../roadmap/later.md).

Merge rules:
- Objects merge key by key; any other value from a later layer replaces the earlier one. `levels` is replaced whole, so a project can drop a default level.
- An array under a key named `deny`, at any depth, is a union: later layers add entries, never remove them. A later layer that sets a `deny` to a non-array, or replaces an object holding a `deny` with a non-object, is refused with the layer and key it conflicts with.
- A missing layer file is an empty layer; invalid JSON is an error naming the file.
- `.aidlc/rules/*.md` are not merged; the loader returns their paths for the hooks and agents that read them.

# Templates
- Files under `plugin/templates/` with `{{path.to.value}}` and `{{#each list}}…{{/each}}`; nothing more. In `#each`, `{{this}}` is the item, names resolve on it first. A missing or non-scalar value is an error naming the variable and file.
- A project file `.aidlc/templates/<same path>` overrides the plugin's.
- Rendered by `init`:
  - `.aidlc/profile.json`;
  - AGENTS.md, first pointing at the root `index.md`;
  - CLAUDE.md (one line: `@AGENTS.md`);
  - the bundle root (`index.md` with `okf_version`, `log.md`);
  - the constitution, `<bundle>/constitution/principles.md`;
  - the doc templates in `.aidlc/templates/docs/`;
  - `.github/workflows/aidlc.yml`, with the runner and the checkout and setup-node pins the project's workflows already use (defaults in `init.workflow`).
  - `.github/dependabot.yml`, weekly bumps for the workflow actions ([Current dependencies](dependencies.md)).

  It also adds `.aidlc/local/` and `.claude/worktrees/` to `.gitignore` and the worktree folder to every other ignore file (`init.ignoreFiles`), so tools skip it, and sets `worktree.baseRef: "head"` in `.claude/settings.json`.
- `security.content`: regexes for code that needs a security review wherever it sits (RLS, TLS skips); an added line matching one requires the `security` focus ([Merge mechanics](gate.md)). `security.secrets` is for credentials: the write hook blocks them.
- `check` warns `PROFILE-KEY` for a top-level or `security` key in a layer file that nothing reads, so a guessed key is not taken for a rule (first migration: `security.patterns`, `security.content` before it existed).
- `levels.<name>.paths`: the test files (`**/*_test.go`), never a folder holding helpers, which are code the proof reverts.
- `checks`: commands run on every merge: lint, format, static analysis.
- `review.fixRounds`: fix rounds per focus before a `fix` escalates (default 3). `decisions.paths` and `generated`: [Plan lint](plan-lint.md#profile-keys-it-reads).
- `names`: [Naming rules](names.md); `deps`: [Current dependencies](dependencies.md); `deploy.platform`: [Operations](operations.md).
- `research.sources` lists sources the owner trusts for the researcher, and `research.max` its source budget (default 8); `models.research` its model ([0010](../decisions/0010-research-and-advice.md)).
- When the project has a lint target (`make lint`, `npm run lint` or `just lint`, from `grid.runners` and `init.lintTargets`), `init` offers it as a module check, for the owner to add to `modules[].check`; it writes nothing for it.
- `init` takes its answers as flags (`--name`, `--base`, `--bundle`); the skill asks the owner first. It never overwrites: it lists an existing file and exits 2 until the owner reruns with `--overwrite <path>`.
- `init --adopt` keeps an existing bundle (the folder whose `index.md` has `okf_version`), records `adopted: <HEAD>` and reports, without changing anything:
  - spec errors and house-rule warnings;
  - leftovers of other tools: unknown top-level dot folders, and commit trailer keys other than the standard and our own.
- Neutral by construction: templates never name the plugin; a test greps rendered output.

# Vendoring
How `init` and `upgrade` copy and pin the CLI: [Vendoring](vendoring.md).
