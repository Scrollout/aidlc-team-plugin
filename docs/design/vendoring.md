---
type: Design
title: Vendoring
description: How init and upgrade copy the CLI into a project and pin it, and why only a release is copied.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T10:28:02Z }
sources:
  - id: aws-aidlc
    resource: https://github.com/awslabs/aidlc-workflows/blob/main/docs/guide/glossary.md
    title: AI-DLC glossary, copy and native channels
---

# Copy and pin
- `init` and `upgrade` copy `plugin/cli/` to `.aidlc/bin/` with a `VERSION` file holding the plugin version. Both refuse to run from the pinned copy itself.
- `upgrade` replaces `.aidlc/bin/` and adds only the templates a project lacks, and a constitution when the bundle holds no Principles doc ([Method](method.md#shape)). It refuses an older plugin than the pinned `VERSION` unless the owner passes `--downgrade`, and says when the release it copied is the one already pinned. It runs `check` with the old copy and the new one and lists each finding only the new one reports (by place and code), so a rule a release adds is planned as a fix before it turns a merge or a project's own check red (first migration: a new warning failed a project test that wants no profile finding, on every merge).
- It copies a release: the installed plugin (a tagged version) or a plugin checkout with no uncommitted change under its plugin folder. A dirty checkout is refused unless the owner passes `--dirty`, as when developing the plugin itself. The reference AI-DLC workflows likewise install only from a versioned release.[^aws-aidlc]
- The session-start status says when the pinned `VERSION` is older than the installed plugin, with the plugin's own `upgrade` command: the pinned copy refuses it, and an owner on Remote Control cannot type `!` commands, so the lead runs it on the owner's yes (first migration).
- CI and the plugin's own hooks run `node .aidlc/bin/aidlc.mjs`, so the project's pinned version is the one that judges it ([Hook mechanics](hooks.md)).

Parent: [Profile and templates](profile.md).

[^aws-aidlc]: AI-DLC glossary, copy and native channels
