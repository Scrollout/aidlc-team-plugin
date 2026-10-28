---
type: Decision
title: 0015 One-way doors are approved one at a time
description: A typed approve may still name several docs, but never more than one one-way-door decision, and never a doc with an unresolved confirmed review finding; each one-way door is shown with its options, findings and facts before it is stamped.
status: accepted
decision-makers: the owner
date: 2026-10-26
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T00:20:00Z }
---

# One-way doors are approved one at a time

## Context and Problem Statement
[0011](0011-plain-word-approval.md) lets the owner approve by typing `approve <doc>…`, and a hook stamps the docs before the lead acts. A single typed approval can stamp dozens of decisions seconds after they are shown: the identity engine, key vault, database, portal and observability stack, mostly for increments not yet planned. Some may contradict each other, and none may have been checked against the target platform. AI-DLC's safeguard is human validation of what the AI proposes. A bulk stamp keeps the form and loses the substance.

## Considered Options
1. Keep 0011 as is, and rely on the owner's care.
2. **Keep the typed approval, but refuse several one-way doors in one command, and anything with an open confirmed finding.**
3. Require a written rationale per approval. That costs the owner on every doc, including the many that are not one-way doors.

## Decision Outcome
Option 2. It extends 0011 rather than replacing it: everything in 0011 stays except:
- `approve` with two or more docs marked `oneWayDoor: true` is refused (`APPROVE-BULK`), naming them. Other docs, such as requirements, plans and bolts, may still be approved together.
- A doc with an unresolved CONFIRMED finding from the design review or a reviewer is refused (`APPROVE-OPEN`). The owner disposes of each finding first.
- Before stamping a one-way door, the hook's context shows the lead its options, the review's findings and the platform facts it cites. The lead's next message repeats them to the owner, and the stamp follows the owner's next typed `approve`.
- `DECISION-HORIZON` keeps decisions for increments beyond the next two from being drafted at all, so there are fewer to approve.

Built in [M18](../roadmap/m18.md).

Principle 5 needs the approval to be the owner's informed act. One decision per command, with its consequences in view, is the smallest change that makes the validation real without slowing the approvals that are not one-way doors.

## More Information
Revisit when:
Owners approve one-way doors singly but just as quickly. Then the measure is the review's findings, not the command.
