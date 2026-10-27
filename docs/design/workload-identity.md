---
type: Design
title: Workload identity
description: Runtimes, domains and data authenticate by workload identity with short-lived credentials, never by shared or static secrets; a merge check fails the common static forms on added lines.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T19:00:00Z }
---

# Why
Components, services and data authenticate to each other by a managed workload identity or federated credentials, a permanent rule of the method. A static secret between components is shared by everything that can read it, outlives the runtime that holds it, and lets one domain reach another's data whatever the code says; a database that trusts every pod as a superuser is the result.

# Rule
- Each runtime and domain has its own workload identity: a cluster service account with a projected token, a cloud managed identity, a workload ID from an identity issuer.
- Calls between them use mTLS or tokens bound to those identities, and each API says which identities may call it.
- Each domain's data is reachable only by its own identity, with short-lived certificates or tokens, so [data ownership](architecture-model.md) holds in the database as well as at merge.
- Anything outside the cluster (cloud APIs, CI deploys) uses federated credentials (OIDC), never a stored client secret.
- Local development and tests use the same mechanism where they can; a test fixture may hold a throwaway password inside the levels' test paths.

The mechanism is a project decision, from official sources ([research](../decisions/0010-research-for-open-questions.md)).

# Check
`GATE-IDENTITY`: an added line outside the levels' test paths and the bundle matching one of `config.identity` patterns:
- database trust authentication (`pg_hba` `trust`, `POSTGRES_HOST_AUTH_METHOD=trust`);
- a URL holding a password (`scheme://user:password@host`);
- a client secret setting (`client_secret`, `AZURE_CLIENT_SECRET`, `clientSecret`) given a value.

Only added lines count, so an adopted project needs no baseline; old forms fail once a bolt touches them. The [secrets hook](hook-checks.md) still blocks real keys anywhere.

# Constitution
`init` writes rule 10 with these points and its check.
