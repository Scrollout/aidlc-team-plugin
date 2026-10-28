---
type: Design
title: Bundle types
description: The bundle's doc types, the folder each lives in and the keys its schema requires; drawn from the bundle settings in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Type | Folder | Required keys |
|---|---|---|
| Intent | `intents/` | - |
| Requirement | `requirements/` | - |
| Decision | `decisions/` | - |
| Bolt | `bolts/` | `scope` |
| Domain | `domains/` | `code`, `kind` |
| Fact | `platform/` | `command`, `environment`, `digest`, `at` |
| System | `system/` | - |
| Module | `modules/` | - |
| Map | `architecture/` | - |
| Glossary | `naming/` | - |
| Request | `requests/` | - |
| Model | `models/` | - |
