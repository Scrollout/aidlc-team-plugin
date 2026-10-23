# Decision

* [0001 Derived state](0001-derived-state.md) - Progress is computed from git and the docs bundle; there is no ledger, event log or handoff file.
* [0002 Worktree subagents](0002-worktree-subagents.md) - Parallel workers are worktree-isolated subagents of one lead session, not peer sessions.
* [0003 Claude Code first](0003-claude-code-first.md) - Ship as a Claude Code plugin first; keep AGENTS.md and the CLI portable so other agent hosts can follow later.
* [0004 Vendored CLI](0004-vendored-cli.md) - The CLI is zero-dependency Node, copied into each project at .aidlc/bin and pinned there.
* [0005 One repo](0005-one-repo.md) - Develop and ship from one repo; the installable plugin is the plugin/ folder only.
* [0006 Engine behind adapters](0006-engine-behind-adapters.md) - Commands and hook rules are pure functions returning data; the CLI and hooks are adapters now, and MCP, HTTP hooks and A2A can be added later without changing the engine.
* [0007 Requirements and architecture as checks](0007-requirements-and-architecture-checks.md) - Lasting requirements become cited docs and architecture rules become gate checks, so a project cannot drift from its intended shape unit by unit.
* [0008 Delegated approvals](0008-delegated-approvals.md) - The owner can let the lead approve two classes of docs itself, re-approvals and quick-lane units, through an untracked personal setting; first approvals of intents, plans, requirements and one-way doors stay with the owner.
* [0009 Owner commands by permission prompt](0009-approval-prompt.md) - The owner runs owner commands (approve, upgrade, delegate) by answering a yes/no permission prompt that the guard raises when the lead runs them, so they work from the mobile app and the web, where ! commands do not run.
* [0010 Research for open questions](0010-research-and-advice.md) - A question the owner cannot answer, or one with no clearly best option, goes to a researcher subagent on a cheap model that writes a cited digest from the project's own sources, official ones first; the lead drafts the decision and the owner still approves.
