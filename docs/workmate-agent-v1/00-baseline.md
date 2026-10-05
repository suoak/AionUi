# WorkMate Agent V1 基线

> 扫描日期：2026-09-16。本文只记录事实基线；M1 的新增代码不计入“扫描前现状”。

## 仓库与版本

| 项目                | 当前值                                                                                       | 上游关系                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| WorkMate            | `main` / `53b4892f105bad33cad2f7ccac491ded1354b351` / `v2.3.0`                               | `upstream/main` 为 `6744099b279b991c17e31c243f0920477bd31cb6`；merge-base 与该提交相同，WorkMate 领先 305、落后 0 |
| AionCore            | 独立仓库 `E:\code\AionCore`，`main` / `e2eddc433965f301dcfda7d6c8a41cae006f65be` / `v0.2.12` | `upstream/main` 为 `4ee474d169f129c2040f90a09922f7b92bba11da`；当前分支领先 348、落后 2                           |
| PI-Desktop 研究快照 | `b48c11d13d4025f7a11917969b5f056dcbdef53d`                                                   | 仅阅读 ADR 和共享类型，不引入其运行时                                                                             |

WorkMate 的 `origin` 是 `suoak/AionUi`，`upstream` 是 `iOfficeAI/AionUi`。AionCore 的 `origin` 是 `suoak/AionCore`，`upstream` 是 `iOfficeAI/AionCore`。WorkMate 根包名为 `csbu-workmate`、版本 `2.3.0`，使用 `packages/*` workspace，并通过 `package.json#aioncoreVersion` 固定 AionCore `v0.2.12`。AionCore 是独立 Cargo workspace，版本 `0.2.12`、Rust edition 2024，现有 27 个 crate；它不是 WorkMate 仓库内的第二套 Host。

扫描开始时工作树不干净。已识别并保留用户在 Agent Center / Agent Workflow 等区域的修改；本次没有 reset、checkout 或覆盖这些修改。开发期间这些区域仍有并行变化，因此最终应按文件分批提交，不能用全工作树提交代替边界审查。

## 当前运行链路

```text
WorkMate renderer
  -> common/adapter/ipcBridge.ts（HTTP + WebSocket）
  -> AionCore aionui-conversation（Conversation API / runtime ownership）
  -> aionui-ai-agent factory + AgentInstance / IAgentTask
  -> SessionAgentTask（Codex、Claude direct CLI）
     或 AcpAgentManager（CodeBuddy 等 ACP provider）
     或 AionrsAgentManager（内置 Aion Agent）
  -> AgentStreamEvent
  -> conversation WebSocket message.stream
  -> WorkMate 各聊天渲染器
```

关键校正：UI 仍把非 Aionrs 会话显示为 ACP 家族，但 AionCore 的 `factory/acp.rs` 明确把 `codex` 和 `claude` 路由到 direct-CLI `SessionAgentTask`，不会回退到 ACP manager；CodeBuddy 仍使用通用 ACP manager；内置 Aion Agent 使用 Aionrs manager。因此不能按 UI 的 `type === 'acp'` 推断真实传输协议。

## Agent 现状

| Agent      | 检测与启动                                                                                        | Session / 恢复                                                                                     | 流与工具                                                                                                    | 权限                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Codex      | agent catalog 保存命令元数据；runtime resolver 校验命令；factory 以 backend label 路由 direct CLI | `aionui-session` Codex backend；持久 session anchor，factory 从 snapshot / backend session id 恢复 | Session events 降为 AionCore `AgentStreamEvent`，经 Conversation WS 输出；工具事件在 session reducer 内统一 | CLI sandbox/approval 配置经 Session build inputs；确认仍由 Conversation API 暴露 |
| Claude     | 与 Codex 相同的 catalog + direct CLI 路由                                                         | `--session-id` 创建，`--resume` 恢复；持久 session anchor                                          | Claude adapter 解析流、tool use、usage、turn result，再降为统一事件                                         | CLI permission mode + Conversation confirmation                                  |
| CodeBuddy  | catalog 内置 ACP 命令，runtime resolver 后启动                                                    | ACP session/new、session/load 与持久 snapshot                                                      | `AcpAgentManager` 负责 handshake、流和 tool call                                                            | ACP permission request 经统一 confirmation API                                   |
| Aion Agent | `agent_type = aionrs`，factory 独立构建 `AionrsAgentManager`                                      | Aionrs session store；`AgentInstance` 标为 persistent                                              | 内置 manager 输出相同 `AgentStreamEvent`                                                                    | inline confirmations + Conversation confirmation API                             |

AionCore 已有 `IAgentTask` 和 `AgentInstance`，涵盖 send、cancel、status、subscribe、media capability、mid-turn delivery，并统一 Acp/Aionrs/Session。M1 不新增 Rust agent trait 或 event bus；TypeScript `AgentAdapter` 是现有 Conversation/Agent runtime 的上层端口。

## Conversation 与 Session

- Conversation 是消息、输入、确认、artifact、runtime lease 和历史的权威聚合；REST 根路径为 `/api/conversations`，流通过 WebSocket `message.stream`。
- `ensure_runtime` 负责创建或恢复 agent runtime；`send`、`cancel`、confirmation、usage 都已有 API。
- 后端启动恢复对未完成消息采取 fail-closed 处理。M1 延续该原则：TaskSession 记录任务治理状态，不替代 Conversation 消息或 backend session。
- 现有 `conversation capabilities` 主要描述 follow-up / steer / inject / tool enforcement；它不是跨 provider 的完整能力声明。

## WorkMate 定制区与冲突风险

WorkMate 的主要二开区域包括品牌与发布配置、Agent Center/Workflow、Skill Evolution、内置 Aion Agent、企业侧入口及大量 AionCore fork 功能。最易与上游冲突的区域是：

1. `packages/desktop/src/common/adapter/ipcBridge.ts` 与 Conversation 页面：上游 API 和聊天 UI 都持续演进。
2. AionCore 的 `aionui-ai-agent`、`aionui-session`、`aionui-conversation`：本 fork 已在 direct CLI、fork、skills、prompt capability 等方面领先上游。
3. DB migrations 和 agent catalog：上游与 fork 都持续追加迁移，合并前必须重新编号并检查 seed 更新。
4. Agent Center / Skill Evolution：存在当前用户修改，本阶段不把它们纳入 M1。

## 证据入口

- WorkMate：`packages/desktop/src/common/adapter/ipcBridge.ts`、`packages/desktop/src/renderer/pages/conversation/components/ChatConversation.tsx`
- AionCore：`crates/aionui-ai-agent/src/agent_task.rs`、`crates/aionui-ai-agent/src/factory/acp.rs`、`crates/aionui-session/src/`、`crates/aionui-conversation/src/routes.rs`
- 上游：[AionUi](https://github.com/iOfficeAI/AionUi/tree/6744099b279b991c17e31c243f0920477bd31cb6)、[AionCore](https://github.com/iOfficeAI/AionCore/tree/4ee474d169f129c2040f90a09922f7b92bba11da)、[PI-Desktop](https://github.com/vastsa/pi-desktop/tree/b48c11d13d4025f7a11917969b5f056dcbdef53d)
