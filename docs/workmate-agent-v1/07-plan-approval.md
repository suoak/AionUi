# Plan + Approval 设计

## 边界调整

当前 AionCore 没有经过验证的、对 Codex、Claude、CodeBuddy 与 Aion Agent 都一致的“可读但绝不写”的 planning runtime mode。直接让 Agent 在普通 Conversation 中先生成 Plan，会允许 provider 在规划阶段触发工具或文件写入，违反“审批前不得执行”。因此 M2 的安全最小闭环采用人工/API 提交 Plan artifact；自动生成 Plan 延后到统一只读 capability 被后端强制执行之后。

这个调整不改变审批与执行语义：Plan 是后端版本化、不可变、可哈希校验的执行契约，而不是一段只存在于 renderer state 的文本。

## 数据与生命周期

- `task_artifacts` 保存 `kind/version/content/content_hash/status`；内容提交后没有 update API，修改只能创建新版本并重新审批。
- `task_approvals` 保存 artifact id 与 hash，pending 只允许解析一次；新版本会取消同类型旧 pending，并 supersede 旧 submitted artifact。
- `task_runs` 绑定 task、conversation、plan artifact、approval；同一 approval 只能创建一次 run。
- 这些表不复用 `conversation_artifacts`：后者要求 conversation id，且 kind/status CHECK 只覆盖 cron/skill suggest 生命周期，不能表达 TaskSession 的不可变执行契约。

状态主线：

```text
ready/paused -> submit artifact -> waiting_approval
waiting_approval -> reject -> paused
waiting_approval -> approve -> ready
ready -> execute exact approved hash -> running -> completed/failed
```

## API

- `POST/GET /api/task-sessions/{id}/artifacts`
- `GET /api/task-sessions/{id}/approvals`
- `POST /api/task-sessions/{id}/approvals/{approval_id}/decision`
- `POST /api/task-sessions/{id}/execute`
- `GET /api/task-sessions/{id}/runs`

所有查询由 repository 同时约束 `user_id + task_session_id`。审批请求必须重复提交 `artifact_id + artifact_hash`；执行请求必须重复提交 `approval_id + artifact_id + artifact_hash`。不匹配、非 pending 审批、已消费 approval 或非 approved artifact 都 fail closed。

## 执行门

绑定了非终态 Plan/Goal TaskSession 的 Conversation 禁止普通 `send_message`，也禁止上层领域直接调用公开 `run_agent_turn`。唯一通路是 `execute_approved_plan`：repository 原子创建已授权 run 后，service 的私有授权入口把数据库中冻结的 Plan 内容交给既有 Conversation orchestrator。

UI 的“Plan ready”面板支持提交、显示 artifact、批准/拒绝与执行。页面刷新、renderer 重挂载和应用重启都只重新读取后端状态，不自动批准、不自动执行。

崩溃后 paused run 不做原地 replay，因为后端无法证明部分 mutation 是否已经发生。显式继续采用“提交新 Plan 版本并重新审批”的安全路径；它会保留旧 run 与旧 artifact 的审计关系。
