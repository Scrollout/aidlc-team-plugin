---
type: Design
title: Profile and templates
description: The project profile, rule layers, the template engine and how the CLI is vendored and pinned.
status: draft
sources:
  - id: aws-aidlc
    resource: https://github.com/awslabs/aidlc-workflows/blob/main/docs/guide/glossary.md
    title: AWS AI-DLC glossary (copy and native channels)
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T08:58:47Z }
---

# Profile (`.aidlc/profile.json`, tracked)
```json
{
  "name": "example",
  "base": "main",
  "docs": { "bundle": "docs" },
  "levels": { "unit": { "paths": ["**/*_test.go"], "run": "make test" }, "integration": { "paths": ["tests/integration/**"], "run": "make it" } },
  "modules": [
    { "id": "api", "paths": ["internal/**", "cmd/**"], "check": "make test", "test": "make test-one PKG={pkg}" },
    { "id": "contracts", "paths": ["api-specs/**"], "check": "make contract-check" }
  ],
  "lanes": { "quick": ["docs/**", "*.md"], "full": ["migrations/**", "api-specs/**"] },
  "focus": { "security": ["internal/auth/**", "**/rls*"], "data": ["migrations/**"] },
  "security": { "content": ["os/exec", "crypto/", "password", "jwt"], "threatModel": "docs/threat-model.md", "check": ["make gate-trivy"] },
  "reserve": { "migration": { "dir": "migrations/{area}", "pattern": "{n:4}_*.sql" } },
  "parallel": { "max": 3 },
  "architecture": { "graph": "make deps-graph", "boundaries": [{ "from": "internal/core/**", "deny": ["internal/providers/**"] }], "checks": ["make contract-check"] },
  "adopted": "<commit where init --adopt ran>",
  "deploy": { "check": ["make image"] },
  "release": "make release"
}
```

# Rule layers
Merged in order, later wins, except that a `deny` in an earlier layer cannot be removed:
1. plugin defaults (`plugin/cli/defaults.json`: base, bundle, parallel, levels, models), beside the CLI so a project's pinned copy carries them
2. org pack: a git repo pinned by tag in `profile.org`, cached under `.git/aidlc/org/` (M2)
3. project: `.aidlc/profile.json`, `.aidlc/rules/*.md`
4. personal: `.aidlc/local/profile.json` (untracked); only this layer may delegate approvals ([0008](../decisions/0008-delegated-approvals.md))

Merge rules:
- Objects merge key by key; any other value from a later layer replaces the earlier one. `levels` is replaced whole, so a project can drop a default level.
- An array under a key named `deny`, at any depth, is a union: later layers add entries, never remove them. A later layer that sets a `deny` to a non-array, or replaces an object holding a `deny` with a non-object, is refused with the layer and key it conflicts with.
- A missing layer file is an empty layer; invalid JSON is an error naming the file.
- `.aidlc/rules/*.md` are not merged; the loader returns their paths for the hooks and agents that read them.

# Templates
- Files under `plugin/templates/` with `{{path.to.value}}` and `{{#each list}}…{{/each}}`; nothing more. Inside `#each`, `{{this}}` is the item and names resolve on the item first, then outside it. A missing or non-scalar value is an error naming the variable and the file.
- A project file `.aidlc/templates/<same path>` overrides the plugin's.
- Rendered by `init`:
  - `.aidlc/profile.json`;
  - AGENTS.md;
  - CLAUDE.md (one line: `@AGENTS.md`);
  - the bundle root (`index.md` with `okf_version`, `log.md`);
  - requirement, intent, unit and decision templates in `.aidlc/templates/docs/`;
  - `.github/workflows/aidlc.yml`.

  It also adds `.aidlc/local/` and the builders' worktree folder `.claude/worktrees/` to `.gitignore`, adds the worktree folder to every other ignore file the project has (`init.ignoreFiles`: `.dockerignore`, `.prettierignore`, …) so tree-walking tools and tests skip it, and sets `worktree.baseRef: "head"` in `.claude/settings.json`.
- When the project has a lint target (`make lint`, `npm run lint` or `just lint`, from `grid.runners` and `init.lintTargets`), `init` offers it as a module check, for the owner to add to `modules[].check`; it writes nothing for it.
- `init` takes its answers as flags (`--name`, `--base`, `--bundle`); the skill asks the owner first. It never overwrites: an existing file is left alone and listed, and `init` exits 2 until the owner reruns with `--overwrite <path>` for each file to replace. Adding lines to `.gitignore` or a missing key to `.claude/settings.json` is not an overwrite.
- `init --adopt` keeps an existing bundle (the folder whose `index.md` has `okf_version`), records `adopted: <HEAD>` and reports, without changing anything:
  - spec errors and house-rule warnings;
  - leftovers of other tools: unknown top-level dot folders, and commit trailer keys other than the standard and our own.
- Neutral by construction: templates never contain the plugin's name; a test greps rendered output.

# Vendoring
`init` and `upgrade` copy `plugin/cli/` to `.aidlc/bin/` with a `VERSION` file holding the plugin version. `upgrade` replaces `.aidlc/bin/` and nothing else, refuses to run from the pinned copy itself, and refuses an older plugin than the pinned `VERSION` unless the owner passes `--downgrade`. It copies a release: the installed plugin, which Claude Code copies from a tagged version, or a plugin checkout with no uncommitted change under its plugin folder; a dirty checkout is refused unless the owner passes `--dirty`, as when developing the plugin itself. AWS AI-DLC likewise installs only from a versioned release.[^aws-aidlc] CI, git hooks and the plugin's own hooks run `node .aidlc/bin/aidlc.mjs`, so the project's pinned version is the one that judges it.

[^aws-aidlc]: AWS AI-DLC glossary (copy and native channels)
