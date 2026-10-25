---
type: Design
title: Workload identity
description: Components, services and data authenticate by workload identity with short-lived credentials, never by shared or static secrets; a merge check fails the common static forms on added lines.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T19:00:00Z }
---

# Why
The owner made it a permanent rule of the method (2026-10-25), asking whether projects should use "some form of internal managed identity, service principal, federated credentials as a method of authn/authz between components, services, data". A static secret between components is shared by everything that can read it, outlives the component, and lets one slice reach another's data whatever the code says; the first migration's dev database trusted every pod as a superuser.

# Rule
- Each service or slice has its own workload identity: a Kubernetes ServiceAccount with a projected token, a cloud managed identity, a SPIFFE ID.
- Calls between components use mTLS or tokens bound to those identities, and each API says which identities may call it.
- Each slice's data is reachable only by its own identity, with short-lived certificates or tokens, so [data ownership](slice-architecture.md) holds in the database as well as at merge.
- Anything outside the cluster (cloud APIs, CI deploys) uses federated credentials (OIDC), never a stored client secret.
- Local development and tests use the same mechanism where they can; a test fixture may hold a throwaway password inside the levels' test paths.

The mechanism is a project decision, from official sources ([research](../decisions/0010-research-and-advice.md)).

# Check
`GATE-IDENTITY`: an added line outside the levels' test paths and the bundle matching one of `config.identity` patterns:
- database trust authentication (`pg_hba` `trust`, `POSTGRES_HOST_AUTH_METHOD=trust`);
- a URL holding a password (`scheme://user:password@host`);
- a client secret setting (`client_secret`, `AZURE_CLIENT_SECRET`, `clientSecret`) given a value.

Only added lines count, so an adopted project needs no baseline; old forms fail once a unit touches them. The [secrets hook](hook-checks.md) still blocks real keys anywhere.

# Constitution
`init` writes rule 10 with these points and its check.
