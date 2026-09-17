# Agent Contract

## 为什么是薄 Adapter

AionCore 已有真正的执行抽象 `IAgentTask`、枚举封装 `AgentInstance` 和统一 `AgentStreamEvent`。因此 M1 的 `AgentAdapter` 不实现 CLI 或 ACP，也不创建第二条事件总线；它把现有 Conversation REST/WS 表达为 WorkMate 上层稳定端口。

```ts
type AgentAdapter = {
  identity(): AgentIdentity;
  capabilities(): AgentCapabilities;
  createSession(input): Promise<Conversation>;
  resumeSession(conversationId): Promise<Runtime>;
  send(conversationId, input): Promise<Turn>;
  cancel(conversationId, turnId): Promise<void>;
  getStatus(conversationId): Promise<Runtime>;
  approve(conversationId, messageId, callId, decision): Promise<void>;
  reject(conversationId, messageId, callId, decision): Promise<void>;
  getUsage(conversationId): Promise<Usage>;
  subscribe(listener): Unsubscribe;
};
```

| Contract 语义 | 复用的现有能力 |
| --- | --- |
| createSession | `POST /api/conversations`，随后显式 `runtime/ensure`，启动失败不会被隐藏 |
| resumeSession | `POST /api/conversations/{id}/runtime/ensure` |
| send | Conversation messages API |
| cancel | Conversation cancel API，携带 turn id |
| getStatus | Conversation 的后端 runtime summary；不存在即报错，不猜测 idle |
| approve / reject | 同一 confirmation endpoint，decision 由 provider schema 决定；默认 `always_allow=false` |
| getUsage | Conversation usage API |
| subscribe | 订阅现有 `message.stream`，只做事件投影 |

`createAgentAdapter(identity, capabilities, port)` 采用依赖注入，Codex、CodeBuddy、Aion Agent、Claude 均使用同一个实现；差异由 identity、capabilities 和 AionCore factory 决定。没有 `CodexAdapter` / `CodeBuddyAdapter` 三份重复代码。

## Capability 模型

字段固定为：`streaming`、`fileRead`、`fileWrite`、`shell`、`mcp`、`skills`、`subagents`、`sessionResume`、`checkpoint`、`nativePlanMode`、`nativeGoalMode`、`imageInput`。

M1 声明的是 provider 家族在当前 AionCore 接入上的保守基线，不代表每个模型、账号或会话都已授权；未知 agent 除流通道外全部 false，并且每次返回能力副本，避免一个 provider 修改对象后污染另一个 provider。

| Provider | streaming | file R/W | shell | MCP | skills | subagents | resume | checkpoint | native plan/goal | image |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Codex | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ |
| Claude | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ |
| CodeBuddy | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| Aion Agent (`aionrs`) | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | —（模型动态能力） |

依据来自当前 AionCore factory、session adapters、agent catalog/migrations 与 prompt capability 迁移，而非 CLI 名称猜测。调度器未来必须取后端会话能力与静态声明的交集；静态 true 不能绕过 permission 或 workspace policy。

## 统一事件投影

`normalizeAgentRunEvent` 将现有 `IResponseMessage` 投影为：

- `started`
- `message.delta` / `message.completed`
- `tool.requested` / `tool.started` / `tool.completed` / `tool.failed`
- `approval.requested`
- `usage.updated`
- `completed` / `failed` / `cancelled`

映射只消费现有 WS 事件：`start`、`text/content`、`tool_call/acp_tool_call`、`permission/acp_permission/ask`、`usage/acp_context_usage`、`finish/error/cancelled`。未知事件返回 `null`，不会被误判为成功。AionCore 仍是事件产生与排序的权威。

## Provider 的真实执行映射

- Codex / Claude：虽然 Conversation 类型在前端属于 ACP 表面，AionCore `route_for_backend` 强制进入 `SessionAgentTask` direct CLI；session create/resume、tool、permission 和 usage 由 `aionui-session` 适配。
- CodeBuddy：走 `AcpAgentManager`，其命令来自 agent catalog；MCP、skills、session snapshot 均沿用 factory 组装逻辑。
- Aion Agent：走 `AionrsAgentManager`，由 `AgentInstance::Aionrs` 提供同一任务接口。
- Claude 在本阶段一并支持，因为它与 Codex 已共享 direct-CLI session 端口，不需要额外重构。

## 安全约束

1. Adapter 不自动重试 send、approve 或任何写操作。
2. runtime status 缺失即失败；未知 capability 默认 false。
3. approve/reject 都不设置永久授权；永久策略留给后续 Policy Engine。
4. TaskSession 的 Plan/Goal mode 不会改变 provider CLI 的权限模式，也不会触发自动执行。
