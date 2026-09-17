# 目标架构与落点

## M1 架构

```text
WorkMate Conversation UI
  ├─ TaskSessionControl ───────────────┐
  └─ existing chat surfaces           │
           │                           │
           ▼                           ▼
TypeScript AgentAdapter          TaskSession REST client
  identity/capabilities          create/list/get/update
  create/resume/send/...               │
           └──────────────┬────────────┘
                          ▼
                AionCore Conversation HTTP/WS
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
      existing Agent Kernel      TaskSession service
      IAgentTask/AgentInstance   state validation/recovery
             │                         │
    ┌────────┼─────────┐               ▼
    ▼        ▼         ▼         SQLite repository
 direct CLI  ACP     Aionrs      task_sessions table
 Codex/Claude CodeBuddy Aion
```

这里的 “Agent Kernel” 是现有 AionCore runtime 的架构角色，不是新增 crate。M1 不让 renderer 成为状态权威：UI 只提交意图并显示 AionCore 返回值。

## 模块落点

| 职责 | 现有模块 / M1 落点 | 理由 |
| --- | --- | --- |
| UI 最小入口 | `packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx` | 复用现有 Conversation header，不重做首页 |
| 前端领域类型 | `packages/desktop/src/common/types/agent/taskSession.ts` | 可供 renderer 与 bridge 共用，不引入 Node/DOM API |
| 业务端 Agent contract | `packages/desktop/src/common/adapter/agentAdapter.ts` | 包装现有 bridge；不把 provider 分支扩散到业务层 |
| HTTP/WS 传输 | `packages/desktop/src/common/adapter/ipcBridge.ts` | 当前所有 AionCore API 的既有边界 |
| API DTO | `aionui-api-types/src/task_session.rs` | AionCore 已有共享 API 类型 crate |
| 领域规则与路由 | `aionui-conversation/src/service.rs`、`routes.rs` | TaskSession 绑定 Conversation，复用 user scope 与错误模型 |
| 持久化契约 | `aionui-db/src/repository/task_session.rs` | 遵守 repository trait 边界 |
| SQLite 实现 | `aionui-db/src/repository/sqlite_task_session.rs`、migration 060 | 使用现有数据库和迁移体系 |
| 启动恢复 | `aionui-app/src/services.rs` | composition root 注入 repo；应用启动时统一 fail-closed |
| Agent 执行 | 现有 `aionui-ai-agent`、`aionui-session`、`aionui-mcp` | 成熟能力直接复用，不新增 crate |

## 权威边界

- AionCore 决定 TaskSession 是否存在、状态迁移是否合法，以及启动时哪些状态必须暂停。
- Conversation 继续拥有消息、runtime、确认、usage 和 backend session；TaskSession 只保存对它的可空引用。
- `agent_session_id` 是未来关联 provider session 的稳定槽位，不替代现有 resume snapshot。
- capability 声明在 M1 是 fail-closed 的 provider 静态基线；Conversation runtime 的动态能力仍可更严格，未来由后端合并裁决。
- Plan/Goal 的 artifact、approval、checkpoint、review 将来应引用 TaskSession，而不是塞入 Conversation JSON；M1 不提前建空表。

## 后续演进约束

下一阶段若实现 Permission Broker、Checkpoint 或 Review，应继续扩展 AionCore 的现有 service/repository，并以 TaskSession id 作为聚合键。只有现有 crate 的职责确实无法承载时才考虑新 crate。任何恢复流程都必须由用户显式触发，不得因 renderer 重挂载或应用重启而重放写操作。
