---
type: Report
title: M7 back-fill pilot report
description: A short pilot of U55 and U56 on CLI 0.63.0 - characterization tests for an existing function, proved by the builder's mutations at merge - and the findings for the next batch.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T08:40:00Z }
---

# Run
The scratch copy of the [M6 pilot](m6-report.md), upgraded from 0.61.0 to 0.63.0 after the owner restarted the lead's session, so the agents loaded the new prompts. Intent I-12 back-fills one existing function with no tests in its own package: a replay cache whose bug would reopen token replay or let memory grow without bound. Unit U-39, full lane under the security focus, scope only that package's test files, three unit-level ACs. About 28 minutes; owner steps: one question, the upgrade prompt, one batched approval.

# What U55 and U56 did
- **Mutations from the builder:** one per AC, each a real break of the behaviour its AC names: a boundary flip in the expiry check, eviction removed, and a refused entry recorded anyway. `aidlc report` refused nothing.
- **Review:** the general and security reviews passed; both judged the three mutations as caught and sent none back. One PLAUSIBLE note on loose AC wording.
- **Gate:** each mutation failed the unit level; the merge carried `Proof: mutation unit`, with no `GATE-PROOF`.
- **U52 to U54 on the way:** `slice:` on the intent cleared `PLAN-SLICE` as designed.

# Findings for the next batch
- **A back-fill still asks for a runbook and a release:** `PLAN-RUNBOOK` fired on the intent, and after the merge `next` ran the deploy check and offered a release, for a change that ships no code.
- **The merge is silent about each mutation:** it prints only the merge line; which AC's mutation failed which level is in the trailer as one word.
- **A weak mutation passes review:** the boundary flip is a real break but a narrow one; the reviewers accepted it. The card could ask for the mutation that breaks the AC's main behaviour.

# Retro
No code fired 3 or more times, no escalations or proposals. Its window starts after the last retro, so it also lists the two upgrades of the 0.61.0 quick check.
