# TaskSession

## 职责

Conversation 继续表示“用户与 Agent 的消息及其 runtime”；TaskSession 表示“为什么执行、按什么模式执行、当前治理状态是什么”。两者是一条可选关联：旧 Conversation 无需迁移，删除 Conversation 时 TaskSession 的 `conversation_id` 置空。

## 数据模型

| 字段 | 类型 / 约束 | 说明 |
| --- | --- | --- |
| `id` | text PK | 服务端生成 UUID |
| `user_id` | text FK, required | 所有查询以当前用户隔离 |
| `title` | text, required | 最大 200 字符 |
| `project_id` | nullable FK | 项目删除时置空 |
| `conversation_id` | nullable FK | 绑定现有 Conversation，创建/更新时校验归属 |
| `mode` | `agent | plan | goal` | M1 只持久化模式 |
| `objective` | text | 最大 20,000 字符 |
| `acceptance_criteria` | JSON string array | 最多 100 项，每项最大 2,000 字符 |
| `status` | 八态 enum | 由后端验证转换 |
| `agent_type` | text, required | provider identity；最大 100 字符 |
| `agent_session_id` | nullable text | 预留 backend session 关联 |
| `created_at` / `updated_at` | integer ms | 服务端时间 |

未来的 `runs`、`approvals`、`checkpoints`、`artifacts`、`review` 是关系预留，不在 M1 建表或塞入一个无类型 JSON 大字段。

## API

| Method | Path | 行为 |
| --- | --- | --- |
| `POST` | `/api/task-sessions` | 创建 draft/ready TaskSession；可绑定当前用户的 Conversation |
| `GET` | `/api/task-sessions?conversation_id=...` | 列出当前用户任务，可按 Conversation 过滤 |
| `GET` | `/api/task-sessions/{id}` | 获取当前用户任务 |
| `PATCH` | `/api/task-sessions/{id}` | 更新字段并验证状态转换、文本限制和 Conversation 归属 |

不存在、跨用户访问或绑定其他用户的 Conversation 都按 not-found / validation error 失败，不泄露对象是否存在。

## 状态机

```text
draft ──> ready ──> running ──> completed
  │         │          ├──────> failed
  │         │          ├──────> cancelled
  │         │          ├──────> paused ──> ready/running
  │         │          └──────> waiting_approval ──> running/paused/completed/failed/cancelled
  │         └─────────> paused/cancelled
  └──────────────────> cancelled
```

`completed`、`failed`、`cancelled` 是终态，不允许重新进入 running。重复提交同一状态是幂等的。M1 不实现 Goal 自动状态机；状态只能通过显式 API 更新或启动恢复规则改变。

## 持久化与恢复

数据落在 AionCore 现有 SQLite 数据库的 `task_sessions` 表。AppServices 构建并注入 `SqliteTaskSessionRepository`。应用启动时，当前所有用户处于 `running` 或 `waiting_approval` 的任务统一改为 `paused`；draft、ready、paused 和终态保持不变。

该恢复只改变治理状态，不调用 Conversation send、不恢复审批、不重放 tool call，也不自动 ensure runtime。用户之后必须显式恢复。这与 PI-Desktop “host authoritative + restart 后不重放 pending/running 工作”的原则一致，但实现完全落在 AionCore 现有 repository/service/composition 模式中。

## UI

Conversation header 增加最小 `Agent | Plan | Goal` 单选入口：

- 未绑定 TaskSession 时没有预选，用户选择任一模式后创建 ready task。
- 已绑定时显示持久化模式与状态 tag；切换模式调用 PATCH。
- UI 使用后端返回值刷新，不在本地伪造状态。
- 旧 Conversation 没有 TaskSession 仍按原逻辑打开和聊天。

## M1 明确不做

不自动运行 Plan/Goal，不创建 Permission Broker、checkpoint、review/audit 表，不新增 workflow/router，不把 TaskSession status 与每个 Conversation turn 自动耦合，也不改变现有消息 schema。
