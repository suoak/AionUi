# 三方能力 Gap Analysis

判定含义：`KEEP` 保留 WorkMate 差异；`REUSE_UPSTREAM` 直接沿用 AionUi/AionCore；`EXTEND` 在现有权威模块增量扩展；`NEW` 当前底座没有且 M1 必须新增；`DEFER` 明确延后。

| 能力                 | WorkMate 当前                                  | AionUi / AionCore 当前                         | PI-Desktop 可借鉴设计                         | 结论             | M1 动作                                                      |
| -------------------- | ---------------------------------------------- | ---------------------------------------------- | --------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| Codex                | 已可用                                         | direct-CLI Session backend、持久恢复、统一事件 | provider contract                             | `REUSE_UPSTREAM` | 只映射到统一 Adapter，不重写 runtime                         |
| Claude               | 已可用                                         | direct-CLI Session backend、permission mode    | provider contract                             | `REUSE_UPSTREAM` | 同步映射，保持原聊天路径                                     |
| CodeBuddy            | 已可用                                         | 通用 ACP manager + catalog                     | provider contract                             | `REUSE_UPSTREAM` | 通过同一 Adapter 端口，不建专用 adapter                      |
| ACP                  | 已可用                                         | handshake、session、tool、permission、MCP      | host/provider 边界                            | `REUSE_UPSTREAM` | 不重写 ACP                                                   |
| Session              | Conversation 与 backend session 已有，缺任务层 | runtime/session 成熟                           | host-owned durable session、epoch fencing     | `EXTEND`         | 新增 TaskSession，保留既有 backend session                   |
| Team                 | 已有                                           | `aionui-team` 成熟                             | 不作为本阶段重点                              | `KEEP`           | 不改、不另建 Team runtime                                    |
| MCP                  | 已有                                           | `aionui-mcp` + factory 注入                    | tool boundary                                 | `REUSE_UPSTREAM` | 不改 MCP runtime                                             |
| Plan                 | 无任务级持久模式                               | agent runtime mode 不等同 Task plan            | immutable plan artifact、显式 operating state | `EXTEND`         | M1 只持久化 `mode=plan`，不执行计划                          |
| Goal                 | 无任务级持久模式                               | 无完整 Goal state machine                      | Goal/Plan 分层                                | `EXTEND`         | M1 只持久化 `mode=goal`，执行逻辑延后                        |
| Permission           | 已有 provider confirmation                     | Conversation confirmation / approval check     | approval identity、host adjudication          | `REUSE_UPSTREAM` | Adapter 映射 approve/reject；broker 延后                     |
| Checkpoint           | Conversation fork/turn anchor 局部具备         | 有 snapshot/fork 基础，不是任务 checkpoint     | host-written checkpoint、restart fence        | `DEFER`          | 只在 TaskSession 文档预留关系                                |
| Review               | 聊天与 artifact 已有，缺任务 review            | 无统一任务 review 聚合                         | message-owned review snapshot                 | `DEFER`          | 不建表、不建 UI                                              |
| Audit                | 有日志，缺治理审计模型                         | 无完整任务 audit ledger                        | durable approval/review trail                 | `DEFER`          | 避免日志输出目标/验收正文                                    |
| Provider abstraction | Rust 已有 `IAgentTask`，前端仍按聊天表面分流   | `AgentInstance` 已统一 runtime                 | explicit provider contract                    | `EXTEND`         | 新增薄 TypeScript AgentAdapter + capability/event projection |
| Enterprise Policy    | 零散策略                                       | approval/sandbox 基础                          | permission broker / policy decision           | `DEFER`          | 不实现 Policy Engine                                         |
| KnowHub Context      | 有企业二开入口                                 | MCP/project/file 可作为接入点                  | context ownership / artifact boundary         | `DEFER`          | 不新增上下文管线                                             |

## 边界结论

1. Agent Kernel 的执行权威仍是 AionCore 的 `IAgentTask` / `AgentInstance` / Conversation service。
2. WorkMate 的 AgentAdapter 是稳定业务端口，不复制 ACP、CLI lifecycle 或 event bus。
3. TaskSession 是本阶段唯一新的后端领域记录，因为 Conversation 不能表达目标、验收条件和治理状态。
4. 从 PI-Desktop 只吸收“后端权威、显式状态、不可静默重放、审批默认拒绝、artifact 可追溯”等原则；不复制 Rust Host、SQLite schema、sidecar、IPC 或 Electron 底座。
5. M1 不声称 Plan/Goal 已能自动运行，也不把 provider 的 runtime mode 冒充 TaskSession mode。
