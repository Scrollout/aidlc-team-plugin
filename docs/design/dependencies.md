---
type: Design
title: Current dependencies
description: Every dependency is the newest stable release with every known security fix, looked up from its registry when it is added or bumped, never from a model's memory, and scanned at merge and in CI.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T06:30:00Z }
---

# Why
On the first migration (2026-10-25) the repository's advisory bot listed seven open advisories in one lockfile, and the owner made it a permanent rule of the method: use the latest packages and security patches. A model's training data is months old, so a version it remembers is stale or vulnerable; the version has to come from the registry at the time, as a small piece of research.

# Shape
```json
"deps": {
  "manifests": ["**/package.json", "**/package-lock.json", "**/go.mod", "**/go.sum", "**/Dockerfile"],
  "check": ["make audit"]
}
```
- `manifests`: globs of the files that pin dependencies. `pin` (optional): the pattern of a line that pins a version; by default a semver-like version, a 40-hex commit or an `@sha256:` digest. `check`: the project's scanners, each failing on a known advisory (and, if the project wants it, on an outdated pin). Both are the project's: the plugin names no tool.

# Rules
- **Card:** a unit whose scope overlaps `manifests` gets `## Dependencies`: look up each version you add or bump from its registry or official release page (your training data is out of date), take the newest stable release that fixes every known advisory, pin it exactly, and report it.
- **Report:** `aidlc report` refuses a `done` report of a unit whose diff adds a pin line to a manifest without `deps`: `[{ "name", "version", "source" }]`, where `source` is the registry URL or the command that showed the version. The reviewer checks the versions against those sources. Only an added line matching `pin` counts, so a Makefile, workflow or deployment edited for another reason can be a manifest without asking for sources (first migration, 2026-10-26).
- **Gate:** each `deps.check` command runs on the trial merge (`GATE-DEPENDENCY`).
- **Tests stay offline:** whether a pin is current is `deps.check`'s job, live, on the gate, CI and the daily run. A unit's tests never query a registry: a level that does needs the network and turns every branch red when upstream ships, whatever it touches (first migration, 2026-10-26: `go list -m -u` and a newest-pnpm test in the unit level). A test of a check script runs it on fixed inputs: an old pin in a fixture and the registry's answer stubbed.
- **CI:** `check --ci` runs them too (`CI-DEPENDENCY`), and the workflow `init` writes also runs daily, so an advisory published after a merge turns the base red; on a red base only fix units build or merge ([Base CI](base-ci.md)).
- **Constitution:** rule 8, current dependencies, in the template `init` writes.
