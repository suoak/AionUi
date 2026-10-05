# Aion strict planning

## Security objective

A guaranteed planning turn must remain non-mutating even when the prompt or model explicitly requests mutation. Prompt instructions are defense in depth only; the runtime policy is authoritative.

```text
mutation attempt
    ↓
mandatory orchestration gate
    ↓
strict runtime ToolPolicy
    ↓
policy_denied
    ↓
no approval request and no Tool::execute
```

## Strict v1 capability profile

| Capability         | Decision                                          |
| ------------------ | ------------------------------------------------- |
| `filesystem.read`  | Allow through `Read`, `Grep`, `Glob`, `ViewImage` |
| `filesystem.write` | Hard deny                                         |
| `shell.readonly`   | Deny in strict v1                                 |
| `shell.execute`    | Hard deny                                         |
| `git.read`         | Deny in strict v1                                 |
| `git.write`        | Hard deny                                         |
| `mcp.read`         | Deny in strict v1                                 |
| `mcp.write`        | Hard deny                                         |
| `network.internal` | Deny in strict v1                                 |
| `network.external` | Hard deny                                         |
| unknown            | Hard deny                                         |

Mutable decisions are non-escalatable. A tool rejected by the runtime policy never reaches user approval, so `ASK → approved → mutation` is not possible in strict planning.

## Runtime setup

Before Aion bootstrap, AionCore applies the strict profile:

1. Clear all configured hooks.
2. Clear all MCP server configuration, including host-injected servers.
3. Disable aionrs native plan tools.
4. Install an exact-name `allow_only` runtime policy for the four audited read tools.
5. Build the engine with the policy.
6. Reapply the same policy when a persisted Aion session is resumed.

The policy is stored on `AgentEngine` and passed into every model tool round. Tool definitions sent to the provider are filtered by the same policy used immediately before execution.

## Isolation assessment

`GUARANTEED` requires all of the following evidence flags and no known bypass:

- mandatory gateway;
- complete registered-tool classification;
- filesystem, shell, Git, MCP, and external-network mutation blocked;
- delegated policy inheritance or non-applicability;
- unknown tools fail closed;
- mutation decisions cannot be upgraded by approval;
- MCP calls are mediated or unavailable.

The assessment is attached to the resolved runtime integration, not the displayed agent brand. An Aion assistant bound to a non-Aion conversation therefore remains `UNSUPPORTED`.

## Automatic planning

Automatic planning is accepted only when:

- the task session is in `plan` mode;
- the conversation is bound to the in-process Aion runtime;
- the isolation assessment is `GUARANTEED`;
- the task can atomically claim the planning state.

The agent output is stored as a versioned plan artifact with a content hash and a pending approval. It cannot transition directly into execution. Execution continues to use the existing M2 approval hash and single-claim gate.

## Failure behavior

- Empty or oversized prompts are rejected.
- Non-guaranteed runtimes receive a forbidden response.
- Slash commands are rejected before the turn starts.
- Agent failures pause the task rather than silently switching policy.
- Missing or invalid plan output fails without producing an artifact.
- Every resumed plan turn re-resolves the still-active task policy. If restart or warmup created an unrestricted idle engine, the task-manager capability boundary discards it and rebuilds a strict engine before model dispatch.

## Deferred expansion

Readonly shell, Git, and trusted MCP are not part of strict v1. Adding them requires a separate audited capability implementation and mutation proof; tool names or command-name heuristics alone are insufficient.
