---
type: Design
title: Profile and templates
description: The project profile, rule layers, the template engine and what init renders and reports.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-23T21:50:00Z }
---

# Profile (`.aidlc/profile.json`, tracked)
```json
{
  "name": "example",
  "system": { "core": ["internal/**"] },
  "base": "main",
  "docs": { "bundle": "docs" },
  "levels": { "unit": { "paths": ["**/*_test.go"], "run": "make test" }, "integration": { "paths": ["tests/integration/**"], "run": "make it" } },
  "modules": [
    { "id": "orders", "kind": "domain", "paths": ["internal/orders/**"], "data": ["data/orders"] },
    { "id": "contracts", "kind": "foundation", "paths": ["api-specs/**"], "check": "make contract-check" }
  ],
  "lanes": { "quick": ["docs/**", "*.md"], "full": ["migrations/**", "api-specs/**"] },
  "focus": { "security": ["internal/auth/**", "**/rls*"], "data": ["migrations/**"] },
  "security": { "secrets": ["\\bACME-[0-9A-F]{32}\\b"], "content": ["BYPASSRLS", "InsecureSkipVerify"], "threatModel": "docs/threat-model.md", "check": ["make scan"] },
  "reserve": { "migration": { "dir": "migrations/{area}", "pattern": "{n:4}_*.sql" } },
  "parallel": { "max": 3 },
  "architecture": { "graph": "make deps-graph", "boundaries": [{ "from": "internal/core/**", "deny": ["internal/providers/**"] }], "data": { "prefix": "data/", "shared": ["data/outbox"] }, "checks": ["make contract-check"] },
  "adopted": "<init --adopt commit>",
  "deploy": { "check": ["make image"] },
  "release": "make release"
}
```

# Rule layers
Merged in order, later wins, except that a `deny` in an earlier layer cannot be removed (`cli.json` `layers`):
1. plugin defaults (`plugin/cli/defaults.json`: base, bundle, parallel, research, review, levels, models, efforts, board, ci, plan), beside the CLI so a project's pinned copy has it
2. project: `.aidlc/profile.json`, `.aidlc/rules/*.md`
3. personal: `.aidlc/local/profile.json` (untracked); only this layer may delegate approvals ([0008](../decisions/0008-delegated-approvals.md))

An org layer (a pinned git repo of rules) is [Later](../roadmap/later.md).

Merge rules:
- Objects merge key by key; any other value from a later layer replaces the earlier one. `levels` is replaced whole, so a project can drop a default level.
- An array under a key named `deny`, at any depth, is a union: later layers add entries, never remove them; a layer setting a `deny` to a non-array, or replacing an object holding one, is refused.
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

  It also adds `.aidlc/local/` and `.claude/worktrees/` to `.gitignore`, the worktree folder to every other ignore file (`init.ignoreFiles`), and `worktree.baseRef: "head"` to `.claude/settings.json`.
- `security.content`: regexes for code that needs a security review wherever it sits (RLS, TLS skips); a line adding one requires the `security` focus ([Merge mechanics](gate.md)). `security.secrets` is for credentials: the write hook blocks them.
- `check` warns `PROFILE-KEY` for a top-level or `security` key in a layer file that nothing reads, so a guessed key is not taken for one.
- `levels.<name>.paths`: the test files (`**/*_test.go`), never a folder holding helpers, which are code the proof reverts. `proves`: `route` or `handoff`, what its tests prove of a slice ([SLICE-TEST](slice-method.md#proved)).
- `checks`: commands run on every merge (lint, static analysis), each safe to run beside builders and reviewers; an object entry is a gate stage ([Lifecycle](lifecycle.md#pipelines)).
- `review.fixRounds`: fix rounds per focus before a `fix` escalates (default 3). `decisions.paths` and `generated`: [Plan lint](plan-lint.md#profile-keys-it-reads).
- `names`: [Naming rules](naming.md); `deps`: [Current dependencies](dependencies.md); `deploy.platform`: [Operations](operations.md).
- `research.sources` lists the sources the owner trusts, and `research.max` its source budget (default 8); `models.research` its model ([0010](../decisions/0010-research-for-open-questions.md)). `efforts`: each agent role's effort ([Intake](intake.md#agents-get-exactly-their-brief)).
- `init` offers a lint target (`make lint`; `init.lintTargets`) only as a module check, `modules[].check`.
- `init` takes its answers as flags (`--name`, `--base`, `--bundle`); the skill asks the owner first. It never overwrites: it lists an existing file and exits 2 until the owner reruns with `--overwrite <path>`.
- `init --adopt` keeps an existing bundle (the folder whose `index.md` has `okf_version`), records `adopted: <HEAD>` and reports, without changing anything:
  - spec errors and house-rule warnings;
  - leftovers of other tools: unknown top-level dot folders and foreign commit trailer keys.
- Neutral by construction: templates never name the plugin; a test checks it.

# Vendoring
How `init` and `upgrade` copy and pin the CLI: [Vendoring](vendoring.md).
