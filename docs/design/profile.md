---
type: Design
title: Profile and templates
description: The project profile, rule layers, the template engine and how the CLI is vendored and pinned.
status: draft
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
1. plugin defaults (`plugin/templates/defaults.json`)
2. org pack: a git repo pinned by tag in `profile.org`, cached under `.git/aidlc/org/` (M2)
3. project: `.aidlc/profile.json`, `.aidlc/rules/*.md`
4. personal: `.aidlc/local/profile.json` (untracked)

Merge rules:
- Objects merge key by key; any other value from a later layer replaces the earlier one.
- An array under a key named `deny`, at any depth, is a union: later layers add entries, never remove them. A later layer that sets a `deny` to a non-array, or replaces an object holding a `deny` with a non-object, is refused with the layer and key it conflicts with.
- A missing layer file is an empty layer; invalid JSON is an error naming the file.
- `.aidlc/rules/*.md` are not merged; the loader returns their paths for the hooks and agents that read them.

# Templates
- Files under `plugin/templates/` with `{{path.to.value}}` and `{{#each list}}…{{/each}}`; nothing more. Inside `#each`, `{{this}}` is the item and names resolve on the item first, then outside it. A missing or non-scalar value is an error naming the variable and the file.
- A project file `.aidlc/templates/<same path>` overrides the plugin's.
- Rendered: AGENTS.md, CLAUDE.md (one line: `@AGENTS.md`), the bundle skeleton, intent/unit/decision doc templates, a CI snippet, `.gitignore` lines.
- Neutral by construction: templates never contain the plugin's name; a test greps rendered output.

# Vendoring
`init` and `upgrade` copy `plugin/cli/` to `.aidlc/bin/` with a `VERSION` file. CI, git hooks and the plugin's own hooks run `node .aidlc/bin/aidlc.mjs`, so the project's pinned version is the one that judges it.
