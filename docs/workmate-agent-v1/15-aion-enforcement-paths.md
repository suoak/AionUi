# Aion enforcement paths

## Audited version

This audit covers AionCore's M3 development branch and the pinned `aionrs v0.2.23` runtime. Claims below are grounded in the checked-in implementation, principally:

- `AionCore/crates/aionui-ai-agent/src/manager/aionrs/agent.rs`
- `AionCore/crates/aionui-ai-agent/src/capability/planning_policy.rs`
- `aionrs/crates/aion-agent/src/bootstrap.rs`
- `aionrs/crates/aion-agent/src/engine.rs`
- `aionrs/crates/aion-agent/src/orchestration.rs`
- `aionrs/crates/aion-agent/src/spawner.rs`

## Authoritative model-tool path

```text
Aion Agent
    ↓ provider emits ContentBlock::ToolUse
AgentEngine::execute_tool_round
    ↓
execute_tool_calls_with_{approval_,}output_limit
    ↓
policy_denial_result
    ├─ exact registered tool lookup
    ├─ runtime ToolPolicy decision
    └─ runtime capability gate
    ↓ ALLOW only
approval provider
    ↓ approved
execute_single
    ↓
Tool::execute_with_context
    ↓
actual tool implementation
```

The policy gate runs before both the protocol approval path and the terminal confirmation path. A legacy tool allowlist changes only the approval source; it cannot override a policy denial. Unknown tool names do not resolve to an executable registry entry and finish as an error.

## Registration inventory

The normal bootstrap can register the following tool families:

| Source               | Tools / behavior                                     | Strict-planning treatment                                |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Built-in filesystem  | `Read`, `Write`, `Edit`, `Grep`, `Glob`, `ViewImage` | Only `Read`, `Grep`, `Glob`, `ViewImage` allowed         |
| Built-in process     | `ExecCommand`                                        | Denied                                                   |
| Agent controls       | `Skill`, `Spawn`, `ToolSearch`                       | Denied                                                   |
| Native plan controls | `EnterPlanMode`, `ExitPlanMode`                      | Not registered because native plan mode is disabled      |
| MCP                  | Dynamically named proxy tools                        | MCP configuration cleared before connection/registration |
| Hooks                | Pre-tool, post-tool, stop commands                   | Hook configuration cleared before bootstrap              |

The AionCore inventory maps every known bootstrap tool name to either a `ToolCapability` or an explicitly denied control classification. Any new or dynamic name is unknown and therefore denied by the exact-name strict policy. The runtime completeness test compares the actual bootstrap registry with this inventory so a newly registered tool breaks the evidence gate.

## Bypass audit

| Potential bypass                | Finding                                                | Evidence / disposition                                                                                                                       |
| ------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct model tool execution     | No model-requested tool bypass was found               | Both engine execution modes call the same orchestration policy gate before `execute_single`                                                  |
| Legacy allowlist / auto-approve | Cannot upgrade a denial                                | Policy check precedes `ApprovalProvider::approve`; mutation tests enable both settings                                                       |
| MCP proxy invocation            | Disabled in strict v1                                  | Server map is cleared before `AgentBootstrap::build`                                                                                         |
| MCP process startup             | Disabled in strict v1                                  | No configured server remains for `connect_mcp`                                                                                               |
| Skill shell expansion or hooks  | Disabled in strict v1                                  | `Skill` denied and hook configuration cleared                                                                                                |
| Spawned subagent                | Disabled in strict v1                                  | `Spawn` denied before execution                                                                                                              |
| Child policy escalation         | Monotonic if Spawn is enabled later                    | `effective_child_tool_policy` clones or intersects the parent policy; it cannot restore a parent-denied tool                                 |
| Slash command                   | Rejected by AionCore before a guaranteed planning turn | Strict planning rejects trimmed input beginning with `/`                                                                                     |
| Native plan tool                | Disabled in strict v1                                  | `config.plan.enabled = false` prevents registration                                                                                          |
| Direct host filesystem mutation | Outside the agent tool request surface                 | Automatic planning orchestration only submits the prompt and persists the returned plan artifact; it does not invoke workspace mutation APIs |

## Read-only tool audit

- `Read` reads bytes and updates only the in-memory file-state cache.
- `Grep` performs content search through its dedicated tool implementation.
- `Glob` enumerates matching paths through its dedicated tool implementation.
- `ViewImage` reads image content for model input and is additionally hidden when the selected model lacks image-input capability.

No shell interpreter, Git command, network client, MCP server, or subagent is available in strict v1. This narrow surface is intentional.

## Re-audit triggers

The isolation assessment must return `UNSUPPORTED` or `BEST_EFFORT` until this document and the mutation tests are updated when any of the following changes:

- a new bootstrap tool is registered;
- a tool alias or wrapper is added;
- orchestration obtains another call path to `Tool::execute`;
- MCP or hooks are re-enabled;
- Spawn is admitted to the strict profile;
- readonly shell or Git support is introduced;
- the pinned aionrs version changes.
