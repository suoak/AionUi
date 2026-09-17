# Goal Workflow 设计

## 最小闭环

Goal 模式在 Plan 审批链上增加一个已批准 Goal artifact。Goal artifact 同时锁定目标文本和有序验收标准；提交后不能通过 TaskSession PATCH 修改 mode、conversation、objective 或 acceptance criteria。变更目标必须创建新版本并重新审批。

执行前同时要求：

1. 一个 approved Goal artifact；
2. 一个 approved Plan artifact；
3. 与 Plan artifact id/hash 精确匹配且尚未消费的 approval。

Goal 不引入通用 Workflow、Router 或 Policy Engine；执行仍复用 Conversation 单轮编排。

## 验收数据

`task_acceptance_criteria` 按 Goal artifact 保存：

- `description`：锁定的标准；
- `status`：`pending | passed | failed | needs_verification`；
- `evidence`：结构化数组，类型为 test result、command result、file diff、artifact 或 user confirmation；
- `verified_at`：最后验证时间。

`PATCH /api/task-sessions/{id}/acceptance-criteria/{criterion_id}` 要求至少一条非空、长度受限的 evidence。执行结束时：普通 Plan 成功即 completed；Goal 若尚未全部 passed，则 run 结束但 TaskSession 保持 paused；最后一项被验证为 passed 后，TaskSession 才进入 completed。failed 或 needs_verification 都不能误报完成。

## 恢复语义

启动恢复把 `running/waiting_approval` TaskSession 和 running task run 改为 paused，不调用 Conversation send、不恢复审批、不重放工具。用户必须重新审阅当前 artifact/run 后再显式发起新版本或后续操作。

## 后续阶段

自动 Goal 拆解、多 Agent 调度、自动证据采集、Policy Engine 和通用 Workflow 均不在 M2。只有当后端提供跨 provider、不可绕过的只读 planning 能力后，才把“人工/API 提交 artifact”替换为“Agent 生成 artifact”，而 approval/run/acceptance 数据契约无需改变。
