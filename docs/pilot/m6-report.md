---
type: Report
title: M6 pilot report
description: A short pilot of U47 to U51 on CLI 0.58.0 to 0.58.2 - deploy check, release, a failed smoke, rollback, a fix unit and a second release on a real project with stand-in deploy scripts.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T07:00:00Z }
---

# Run
The scratch copy of the [M5 pilot](m5-report.md), upgraded from CLI 0.49.0. The project has no deploy target, so the profile's `deploy` steps ran stand-in scripts the lead kept untracked; the smoke failed until the base had `ops/HEALTHY`. Intent I-11, one quick-lane docs unit U-37, linked the project's portal runbook. About 50 minutes from elaboration to the second release. Owner steps: one batched approval, `release I-11`, `rollback I-11`, `approve U-38`, two upgrades, `release I-11`.

# What U47 to U51 did
- **U50 runbook:** `PLAN-RUNBOOK` fired on the draft intent and cleared once it linked a Runbook doc.
- **U47 deploy check:** after the merge, `next` named `aidlc deploy check I-11`; it passed in under a second and `next` offered the release.
- **U48 release:** the owner typed `release I-11`; auto mode refused neither `release` nor `rollback`. The go was missed the first two times (below) and used on the second release with no prompt (0.58.2).
- **U49 smoke and rollback:** the smoke failed (exit 4), the ⛔ stop came before any other work, the owner typed `rollback I-11`, and `next` asked for a fix unit. Fix unit U-38 (`--after I-11`) passed general and security review and merged; the check and release ran again on the new base, the smoke passed and I-11 was released.
- **U51 retro:** listed the failed smoke and U-38 as the fix unit after I-11.

# Bugs fixed during the run
- **0.58.1:** adding `deploy` to the profile turned the ten intents released by tag back into merged, so `next` asked to deploy each. A tag counts again (owner's choice).
- **0.58.2:** the lead's `… release I-11 2>&1 | tail` read as `release I-11 2>`, so the typed go never matched and the owner got permission prompts. The guard now matches without the redirect.
- **0.58.3:** the retro left out the owner's approval of U-38, a unit with no intent, and recorded the prompts with the `2>`. Fix units after an intent now count in its retro.

# Findings for the next batch
- **Fix skeleton fails plan lint:** `aidlc fix … --after I-11 --scope "ops/**"`, as `next` names it, failed `PLAN-TEST` (no test location in scope) and `PLAN-REQ` (no requirement). The line gives no hint; the lead fixed it by hand.
- **Upgrade adds no new templates:** `upgrade` replaces only `.aidlc/bin`, so `PLAN-RUNBOOK`'s fix names a runbook template the project does not have.
- **No way to park a merged intent:** `hold` is ignored on a merged intent, and the steer hook blocked each turn while the lead waited for 0.58.1.
- **Slow merges:** 269 s for a quick-lane docs unit, 339 s for U-38.

# Retro
No code fired 3 or more times, no escalations, no proposals. Deploy failures: the smoke, with U-38 as the fix unit.
