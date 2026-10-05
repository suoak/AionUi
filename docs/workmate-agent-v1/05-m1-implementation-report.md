# M1 实施报告

> 验证日期：2026-09-16。实现横跨 WorkMate 与独立 AionCore 仓库。

## 修改与新增文件

WorkMate：

- 新增 `packages/desktop/src/common/adapter/agentAdapter.ts`
- 新增 `packages/desktop/src/common/types/agent/taskSession.ts`
- 新增 `tests/unit/common-adapter/agentAdapter.test.ts`
- 修改 `packages/desktop/src/common/adapter/ipcBridge.ts`
- 修改 `packages/desktop/src/common/index.ts`
- 修改 `packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx`
- 修改 13 个 `conversation.json` locale 及生成的 `i18n-keys.d.ts`
- 新增本目录 6 份 M0/M1 文档

AionCore：

- 新增 `crates/aionui-api-types/src/task_session.rs`
- 新增 `crates/aionui-db/migrations/060_task_sessions.sql`
- 新增 `crates/aionui-db/src/models/task_session.rs`
- 新增 `crates/aionui-db/src/repository/task_session.rs`
- 新增 `crates/aionui-db/src/repository/sqlite_task_session.rs`
- 修改上述 crate 的 `lib.rs` / `mod.rs` 导出
- 修改 `crates/aionui-conversation/src/service.rs`、`routes.rs`
- 修改 `crates/aionui-app/src/services.rs`

用户并行修改的 Agent Center、Agent Workflow、Skill Evolution 与 `agent.json` 文件不属于本 M1，未清理或覆盖。

## 数据库与 API

migration 060 创建 `task_sessions` 表、用户更新时间索引和 Conversation 查询索引。外键删除策略保护历史任务：用户删除级联；Project/Conversation 删除置空。

新增 `/api/task-sessions` POST/GET 和 `/api/task-sessions/{id}` GET/PATCH。service 校验 user scope、Conversation 归属、文本大小、JSON 验收条件与有限状态转换。启动恢复把 running/waiting_approval 改为 paused，不重放执行。

## AgentAdapter 实现

Adapter 是现有 `ipcBridge.conversation` 的可注入 facade：所有 provider 共用一份 create/resume/send/cancel/status/approval/usage/subscribe 实现。identity 与显式 capability 数据决定差异，真正的 CLI/ACP/Aionrs 路由仍由 AionCore factory 决定。现有 WS 消息被投影为统一 AgentRunEvent，但没有新增 event bus。

## TaskSession 实现

TaskSession 的 API DTO、状态机与持久化权威位于 AionCore；WorkMate 只有同构类型、REST client 与最小 Conversation UI。旧 Conversation 不要求补数据。Agent/Plan/Goal 当前只影响 task mode，不触发 Goal workflow。

## 兼容性说明

- 没有修改现有 Conversation schema、send/cancel API 或聊天 renderer 的 provider 路由。
- Codex/Claude 继续 direct CLI；CodeBuddy 继续 ACP；Aion Agent 继续 Aionrs。
- MCP、file、shell、Team 和 WorkMate 二开运行时未替换。
- 新 UI 只在 Conversation header 增量挂载；无 TaskSession 时聊天行为不变。

## 验证结果

已通过：

- `vitest run tests/unit/common-adapter/agentAdapter.test.ts`：1 file，8 tests（含 Codex、CodeBuddy、Aion Agent 参数化映射）
- Conversation 兼容性测试：4 files，65 tests（legacy ChatConversation、ACP message/send box、Aionrs send box）
- `tsc --noEmit`
- `node scripts/check-i18n.js`：13 locales、key type、配置全部通过
- `electron-vite build --config packages/desktop/electron.vite.config.ts`：main、preload、renderer 生产构建通过；仅有既有依赖/chunk size 警告
- `cargo fmt --all -- --check`
- `cargo metadata --no-deps --format-version 1`

Rust compile/test 被本机工具链环境阻断：MSVC `link.exe` 不在 PATH；改用工具链自带 `rust-lld` 后又确认 Windows SDK 的 `kernel32.lib`、`ntdll.lib`、`userenv.lib` 等系统库未安装；GNU host toolchain 也因本机 MinGW 缺失 `_Unwind_*` / `_GCC_specific_handler` 符号而无法链接 build script。因此 Rust 测试源码已经补齐，但本机未执行到测试断言，这不是断言失败。

## 已知问题

1. WorkMate 仍固定已发布的 AionCore `v0.2.12`。TaskSession API 要进入打包应用，必须先发布包含本变更的新 AionCore 版本，再单独更新 `aioncoreVersion`；当前不能虚构一个不存在的 release。
2. M1 capability 是 provider 静态基线，尚未与每个会话动态协商结果合并。
3. PATCH 的可空关联字段当前表示“缺省不变”，尚无显式 clear 操作。
4. TaskSession status 尚未自动跟随每个 Agent turn；这是刻意保留给后端运行编排阶段，而不是由 UI 猜测。

## 下一阶段建议

1. 先发布并固定新的 AionCore 版本，完成打包态端到端验证。
2. 在 AionCore 输出动态 provider capability snapshot，并在 policy 层取交集。
3. 引入显式 TaskRun，再把 Conversation turn、approval、artifact 与 TaskSession 关联。
4. 设计 Permission Broker 与 checkpoint/review 时沿用 backend-authoritative、epoch/identity fencing 和 fail-closed 恢复，不复制 PI runtime。

## 建议提交拆分

本次未自动提交。建议分别在两个仓库按 Conventional Commit 拆分：文档、Agent contract、TaskSession DB/API、UI 连接、测试；发布 AionCore 与更新 WorkMate pin 应再作为独立提交/PR。
