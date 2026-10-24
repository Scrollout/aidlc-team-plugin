---
type: Decision
title: 0006 Engine behind adapters
description: Commands and hook rules are pure functions returning data; the CLI and hooks are adapters now, and MCP, HTTP hooks and A2A can be added later without changing the engine.
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T09:38:26Z }
sources:
  - id: cc-hooks
    resource: https://code.claude.com/docs/en/hooks
    title: Claude Code hooks reference
---

# Context
The owner may later run the agent in a sandbox and the plugin as a remote toolbox behind MCP or A2A. The rules must then still hold at the action ([Principles](../constitution/principles.md) 1 and 5), not depend on the agent obeying its instructions.

# Options
1. CLI only, printing text. Simple now; a remote host would have to parse text back into data, and every command would need rework.
2. **An engine of pure functions with thin adapters.** The CLI and the hooks are the first adapters; an MCP server, HTTP hooks and an A2A agent can follow.
3. Build the servers now. Code against the budgets for a setup nobody runs yet.

# Decision
Option 2, chosen by the owner on 2026-10-22. The servers are M3 work.

# Why
- Claude Code hooks can be `command`, `http` (POST the event JSON to a URL, same JSON decision back) or `mcp_tool`, and they fire on MCP tool calls too.[^cc-hooks] The same decision functions can therefore judge a local hook, a remote hook or a toolbox call.
- Returning data keeps one implementation for every caller; the CLI's text output becomes one rendering of it.

# Consequences
- Every command handler returns `{ code, findings, output }`, and every hook rule the decision JSON its hook prints, as that `output`. Neither prints, writes stdout or exits; the adapter does ([CLI engine](../design/cli-engine.md)).
- Remote mode holds only if every action goes through the engine. The agent's shell and file writes either pass through hooks that call the engine (blocking hooks keep `onFailure: "block"`, so an unreachable engine denies), or the agent has no native write tools and acts only through toolbox tools checked server-side.
- In remote mode the toolbox owns the repository and the push credentials; merges happen only through its gate.
- Owner actions (`approve`, tags, releases) are never exposed on an agent-facing adapter. Remotely they need a channel the agent cannot reach, such as a signed commit or a separate authenticated endpoint.
- Instructions (skill, agent prompts, cards) may be served as MCP prompts and resources; they guide, they do not enforce.
- MCP fits the toolbox; A2A fits only if builder and reviewer later run as separate remote agents.

[^cc-hooks]: Claude Code hooks reference
