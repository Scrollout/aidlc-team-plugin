---
type: Report
title: M5 pilot 1 report
description: A short pilot of U40 to U42 on CLI 0.49.0 - a generated-files map on a real project, the clear between intents, and the findings for the next batch.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T06:00:00Z }
---

# Run
The scratch copy of the [M4 pilot 3](m4-3-report.md), CLI 0.49.0. Intent I-10 makes one API error carry a retry hint. U-35 changed the contract, a generated chain from a TypeSpec source to the API spec, generated code and the portal schema. U-36 changed the server. The run took about 63 minutes from mapping to merge, about 3 of them waiting on the owner. There were no builder stops (I-9 had two), no fix rounds, and four reviews with no findings.

# What U40 to U42 changed
- **U41 clear between intents:** `next` and `status` asked the owner to `/clear`. After the clear, the status hook brought the lead back.
- **U40 generated files:** the lead mapped five generators in the profile, with outputs taken from `git ls-files`. The I-10 plan scoped every source and output, so `PLAN-GENERATED` had nothing to catch. A local probe, reverted afterwards, showed the check firing when outputs were dropped.
- **U42 refused owner commands:** not exercised. The CLI refused no owner command.

# Findings for the next batch
- **The clear line repeats:** after the clear, `next` still asks for it, since the CLI cannot tell that it happened.
- **One output is enough:** `PLAN-GENERATED` needs only one of an entry's outputs in scope. A scope covering one generated-code folder passed without the second output the same generator writes. Requiring every output would catch that, but a change that touches only a header would then have to scope version files it does not change.
- **A skipped test counts as a pass:**
  - U-36's tagged test needs a database and skips without one.
  - Proof-revert saw it still "pass" with the change reverted and refused the merge with `GATE-PROOF`, which is the right result for the wrong reason. The lead re-ran the merge with a throwaway database, and it passed.
  - The same skip would let a level run pass with the AC's test not run at all.
- **Level slip:** the AC was labelled `(unit)` for a test the project counts as integration. No check caught it.
- **Worktrees left after merges:** both builder worktrees survived their merges again. `next` named the cleanup each time, and the lead ran it.
- **Upgrade from another release's folder:** told to upgrade from the 0.49.0 install while its session had loaded 0.46.0, the lead hit an auto-mode refusal on the next command. The owner confirmed in the pilot session. Next time the owner restarts the session after a plugin update.

# Retro
No code fired 3 or more times, and there were no escalations or proposals.
