---
type: Design
title: Naming grammar
description: Each kind of name, the template it is composed from, the tokens it needs, its bounds and where a stack-neutral rule looks for it; drawn from naming.grammar in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Kind | Template | Needs | Bounds | Checked in |
|---|---|---|---|---|
| `domain` | `{{domain}}` | domain | - | - |
| `slice` | `{{verb}}{{singularCompact}}` | domain, verb | class lower-alnum | - |
| `operation-id` | `{{TypePascal}}_{{OperationVerb}}` | domain, verb | - | - |
| `namespace-api` | `{{Namespace}}` | org, system | - | - |
| `path` | `/{{typeCamel}}/{{{singularCamel}}Name}` | domain | - | - |
| `permission` | `{{Namespace}}/{{typeCamel}}/{{action}}` | org, system, domain, action | global scope | - |
| `event` | `{{Namespace}}.{{SingularPascal}}{{PastVerb}}` | org, system, domain, verb | global scope | - |
| `api-version` | `{{date}}{{previewSuffix}}` | date | - | - |
| `schema` | `{{domain}}` | domain | max 63 | - |
| `db-role` | `{{system}}_{{domain}}` | system, domain | max 63 | - |
| `table` | `{{domain}}.{{tableSnake}}` | domain, table | max 127 | `migrations/**/*.sql` |
| `migration` | `migrations/{{domain}}/{{number4}}_{{verb}}_{{objectSnake}}.sql` | domain, number, verb, object | - | - |
| `deployable` | `{{system}}-{{part}}-{{role}}` | system, part, role | max 63, class dns-label | - |
| `image` | `{{registry}}/{{org}}/{{system}}-{{part}}-{{role}}:{{tag}}` | registry, org, system, part, role | - | - |
| `k8s-namespace` | `{{system}}-{{env}}` | system, env | max 63, class dns-label | - |
| `host` | `{{system}}{{roleSuffix}}.{{env}}.{{zone}}` | system, env, zone | max 253, global scope | - |
| `metric` | `{{system}}_{{domain}}_{{metricSnake}}_{{unit}}` | system, domain, metric, unit | class lower-snake | - |
| `config-key` | `{{section}}.{{keyCamel}}` | section, key | - | - |
