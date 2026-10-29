---
type: Design
title: Runtime view
description: One bolt from approval to release as a sequence - the lead, the hooks, the pinned CLI, a builder and a reviewer in their worktrees, git, CI and the owner.
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-29T20:30:00Z }
---

# One bolt, start to end
```mermaid
sequenceDiagram
  autonumber
  actor Owner
  participant Lead as Lead session
  participant Hooks
  participant CLI as Pinned CLI
  participant Builder as Builder in its worktree
  participant Reviewer as Reviewer
  participant Git as Git and remote
  participant CI as Base CI

  Owner->>Lead: approve the plan
  Lead->>CLI: next
  CLI-->>Lead: build B-n (card)
  Lead->>Hooks: Agent: builder, AI model from the card
  Hooks->>CLI: hook model
  CLI-->>Hooks: AI model checked, card added, launch marked
  Hooks-->>Builder: starts with the card
  Builder->>CLI: start B-n
  CLI->>Git: branch bolt/B-n from the card's base
  loop each AC
    Builder->>Hooks: edit a file
    Hooks->>CLI: hook scope, hook secrets, hook heartbeat
    CLI-->>Hooks: allow, or refuse with the fix
    Builder->>Git: commit test, then code
  end
  Builder->>CLI: report B-n
  CLI-->>Builder: recorded (or refused: missing tests, bad mutations)
  Lead->>CLI: next
  CLI-->>Lead: review B-n, focus general
  Lead->>Reviewer: Agent: reviewer
  Reviewer->>Git: read the diff, run the card's test runs
  Reviewer->>CLI: review record B-n
  alt verdict fix
    CLI-->>Lead: next: fix round for B-n
    Lead->>Builder: continue from the last commit
  else verdict pass
    Lead->>CLI: next
    CLI-->>Lead: merge B-n
    Lead->>CLI: merge B-n
    CLI->>Git: trial merge, AC tests, levels, proof, checks, rules
    CLI->>Git: merge commit with Unit, Card and Review trailers
  end
  Lead->>CLI: push
  CLI->>Git: history check, then push the base
  Git->>CI: run the base's workflows
  Lead->>CLI: ci wait
  CLI-->>Lead: green
  CLI-->>Owner: release I-n (exit 2: the owner's step)
  Owner->>CLI: release I-n
  CLI->>CI: deploy, then smoke on the target
  Lead->>Hooks: end of turn
  Hooks->>CLI: hook steer
  CLI-->>Hooks: let the turn end, or block with the next step
```

# Notes
- Each step the lead takes is the one `next` printed; the Stop hook sends it back to work while a step of its own is due, and lets the turn end for an owner step, a question to the owner, or a running agent ([Steering](../steering.md)).
- A builder's tool calls keep its bolt's heartbeat fresh; a quiet builder with no report is restarted from its branch after 12 minutes ([Agents in flight](../in-flight.md)).
- The gate merges the bolt as a whole commit and reruns its tests on the merge result, then with its code reverted, where they must fail ([Merge mechanics](../gate.md)).

Logical blocks: [Logical view](logical.md). Parts and connections: [Technical view](technical.md).
