---
type: Design
title: Naming grammar
description: Each kind of name, the template it is composed from and the tokens it needs; drawn from naming.grammar in cli.json.
status: stable
generated: { by: tests/diagrams.mjs }
---

| Kind | Template | Needs |
|---|---|---|
| domain | `{{domain}}` | domain |
| slice | `{{verb}}{{singularCompact}}` | domain, verb |
| operation-id | `{{TypePascal}}_{{OperationVerb}}` | domain, verb |
| namespace-api | `{{Namespace}}` | org, system |
| path | `/providers/{{Namespace}}/{{typeCamel}}/{{{singularCamel}}Name}` | org, system, domain |
| permission | `{{Namespace}}/{{typeCamel}}/{{action}}` | org, system, domain, action |
| event | `{{Namespace}}.{{SingularPascal}}{{PastVerb}}` | org, system, domain, verb |
| api-version | `{{date}}{{previewSuffix}}` | date |
| schema | `{{domain}}` | domain |
| db-role | `{{system}}_{{domain}}` | system, domain |
| table | `{{domain}}.{{tableSnake}}` | domain, table |
| migration | `migrations/{{domain}}/{{number4}}_{{verb}}_{{objectSnake}}.sql` | domain, number, verb, object |
| deployable | `{{system}}-{{part}}-{{role}}` | system, part, role |
| image | `{{registry}}/{{org}}/{{system}}-{{part}}-{{role}}:{{tag}}` | registry, org, system, part, role |
| k8s-namespace | `{{system}}-{{env}}` | system, env |
| host | `{{system}}{{roleSuffix}}.{{env}}.{{zone}}` | system, env, zone |
| metric | `{{system}}_{{domain}}_{{metricSnake}}_{{unit}}` | system, domain, metric, unit |
| config-key | `{{section}}.{{keyCamel}}` | section, key |
