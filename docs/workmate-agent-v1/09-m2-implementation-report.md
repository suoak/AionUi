# M2 实施报告

> 日期：2026-09-16。实现跨 WorkMate 与独立 AionCore 仓库；未提交、未推送、未发布。

## 已实现

AionCore：

- migration 061：Task artifact、approval、run、acceptance criterion 四张独立表；migration 060 保持 TaskSession 聚合根。
- API types：完整 Plan/Goal DTO、状态枚举、结构化 evidence 与状态迁移表。
- repository：artifact 版本化、hash 绑定审批、重复审批拒绝、一次性执行、run 收尾、验收更新与重启暂停。
- service/routes：artifact/approval/run/criteria API；Goal 锁定；Conversation 普通发送和公开 agent turn 的执行门；批准内容通过既有 Conversation orchestrator 执行。
- App 启动恢复同时暂停不完整 TaskSession 与 run，不重放执行。

WorkMate：

- 同构 TypeScript 契约与 `ipcBridge.taskSession` client。
- Conversation 中的最小“Plan ready”面板：Plan/Goal 提交、artifact 展示、批准/拒绝、执行、Goal 人工证据确认。
- 13 个 locale 均增加相同 key 集合，没有新增硬编码用户文案。

## 安全不变量

- artifact 提交后无修改 API；修改产生新 version 和新 approval。
- approval 与 run 同时绑定 task、artifact id、SHA-256 hash 和用户归属。
- renderer 不能携带任意 plan 内容到 execute；执行内容只从数据库读取。
- Plan/Goal Conversation 的普通 send 与公开 upper-domain agent turn fail closed。
- 重启不自动发送消息、恢复 approval 或重放 tool call。
- Goal 所有标准 passed 之前不会 completed。

## 验证结果

- WorkMate `tsc --noEmit`：通过。
- `node scripts/check-i18n.js`：通过；i18n key types 已重新生成。
- WorkMate 全量 Vitest：558 个文件通过、1 个跳过；5494 个测试通过、12 个跳过。
- AionCore `cargo fmt --all -- --check`：通过。
- migration immutability PowerShell 自测与检查：通过。
- Rust check/test：MSVC 被 `link.exe` 缺失阻塞；GNU fallback 被 MinGW 8.1 SJLJ 与 Rust 1.95 unwind ABI 不兼容阻塞；Docker、WSL、bash 均不可用。已增加 migration 060/061、状态机、artifact/hash/重复审批、版本 supersede 与 Goal criteria 测试，但必须由 Linux CI 实际运行。

## 未完成与 Release Gate

M1.5 仍未关闭：没有 CI 绿灯、没有 `v0.2.13` 公共 Release、WorkMate 仍 pin `v0.2.12`、没有打包态 smoke。详见 `06-release-gate.md`。

自动 Agent planning 没有伪实现。由于现有 provider runtime 没有统一、强制只读的 planning contract，当前安全版本由用户/API 提交 Plan；该边界和后续迁移路径记录在 `07-plan-approval.md`。

## 已知问题与进入 M3 前的工作

- 先关闭 M1.5 Release Gate；未完成正式 Core 发布和 pin 前，打包版仍不能使用这些 API。
- 增加跨 provider 的后端强制只读 planning capability 后，才能安全启用 Agent 自动生成 Plan。
- paused run 不做不安全的原地 replay；当前显式继续方式是新 Plan 版本加重新审批。若未来增加 checkpoint resume，必须证明幂等边界。
- 自动收集 test/command/diff/artifact evidence 尚未实现；当前 API 支持结构化类型，最小 UI 提交 user confirmation。
- M3 可在集中 `enforce_task_execution_gate` 边界扩展 Policy hook，但不得把 filesystem/shell/network 判断散落到 UI。

## 主要修改文件

- AionCore：`060_task_sessions.sql`、`061_task_execution_contracts.sql`、`aionui-api-types/src/task_session.rs`、`aionui-db` 的 task session model/repository、`aionui-conversation/src/service.rs` 与 `routes.rs`、`aionui-app/src/services.rs`、migration 测试。
- WorkMate：`common/types/agent/taskSession.ts`、`common/adapter/ipcBridge.ts`、Conversation `ChatConversation.tsx`、13 个 conversation locale、生成的 i18n key types，以及本目录 06–09 文档。

## 建议提交拆分

1. AionCore `feat(task-session): add plan and goal execution contracts`
2. AionCore `test(task-session): cover migrations and approval invariants`
3. WorkMate `feat(conversation): add plan approval controls`
4. WorkMate `docs(agent): document m15 release gate and m2 contracts`
5. Release 后单独 `chore(core): pin aioncore v0.2.13`

本轮按要求没有创建 commit、tag、PR 或 push。
