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
  "modules": [
    { "id": "api", "paths": ["internal/**", "cmd/**"], "check": "make test", "test": "make test-one PKG={pkg}" },
    { "id": "contracts", "paths": ["api-specs/**"], "check": "make contract-check" }
  ],
  "lanes": { "quick": ["docs/**", "*.md"], "full": ["migrations/**", "api-specs/**"] },
  "focus": { "security": ["internal/auth/**", "**/rls*"], "data": ["migrations/**"] },
  "security": { "content": ["os/exec", "crypto/", "password", "jwt"], "threatModel": "docs/threat-model.md", "check": ["make gate-trivy"] },
  "reserve": { "migration": { "dir": "migrations/{area}", "pattern": "{n:4}_*.sql" } },
  "parallel": { "max": 3 },
  "deploy": { "check": ["make image"] },
  "release": "make release"
}
```

# Rule layers
Merged in order, later wins, except that a `deny` in an earlier layer cannot be removed:
1. plugin defaults (`plugin/templates/defaults.json`)
2. org pack: a git repo pinned by tag in `profile.org`, cached under `.git/aidlc/org/` (M2)
3. project: `.aidlc/profile.json`, `.aidlc/rules/*.md`
4. personal: `.aidlc/local/` (untracked)

# Templates
- Files under `plugin/templates/` with `{{path.to.value}}` and `{{#each list}}…{{/each}}`; nothing more.
- A project file `.aidlc/templates/<same path>` overrides the plugin's.
- Rendered: AGENTS.md, CLAUDE.md (one line: `@AGENTS.md`), the bundle skeleton, intent/unit/decision doc templates, a CI snippet, `.gitignore` lines.
- Neutral by construction: templates never contain the plugin's name; a test greps rendered output.

# Vendoring
`init` and `upgrade` copy `plugin/bin` and `plugin/lib` to `.aidlc/bin/` with a `VERSION` file. CI, git hooks and the plugin's own hooks run `node .aidlc/bin/aidlc.mjs`, so the project's pinned version is the one that judges it.
