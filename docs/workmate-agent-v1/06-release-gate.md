# M1.5 Release Gate

> 状态：`BLOCKED_EXTERNAL`（2026-09-18）。AionCore 发布链路、WorkMate pin、构建和核心 packaged smoke 已完成；唯一未通过的必选项是 CodeBuddy live smoke。本机 CodeBuddy CLI 可运行，但没有登录凭据，命令明确返回 `Authentication required. Please use /login command to sign in to your account`。

## AionCore 发布证据

- 开发分支：`feat/task-session-release-gate`
- 远程候选提交：`6905fcff01ef429dd5543c5845943c8dba39e066`
- 功能合并提交：`e7251b4e2073b09c532357102c053cbfdeeec14a`
- Release 提交：`321e9dc268e7c4bc8eaf358dad4a483dde606f4d`
- Release tag：`v0.2.13`
- Release：https://github.com/suoak/AionCore/releases/tag/v0.2.13
- PR CI：https://github.com/suoak/AionCore/actions/runs/35249612218
- Release commit CI：https://github.com/suoak/AionCore/actions/runs/35288957558
- Release workflow：https://github.com/suoak/AionCore/actions/runs/35292420454

Release commit CI 的以下检查全部通过：

```text
cargo fmt --all -- --check
cargo check --workspace
cargo clippy --workspace -- -D warnings
cargo nextest run --workspace
cargo test --workspace
Migration Immutability
```

并发和恢复证据包括：

```text
concurrent_approval_claim_allows_exactly_one_resolution
concurrent_execution_claim_allows_exactly_one_run
startup_recovery_pauses_only_incomplete_execution
```

并发测试使用文件型 SQLite、多独立连接、conditional update、transaction 和持久化状态转换，不依赖 process mutex。Migration `060_task_sessions.sql` 和 `061_task_execution_contracts.sql` 已覆盖 fresh DB 与已有 pre-060 DB；`060` 外键指向 `projects(project_id)`。迁移测试包括：

```text
migration_060_applies_to_the_059_foreign_key_shape
migration_061_adds_the_plan_goal_contract_tables
every_table_is_classified_for_aionpro_adoption
```

## Release artifacts 与 checksum

现有 Release workflow 成功生成六个平台归档和 `aioncore-checksums.txt`。已下载全部七个文件到独立验证目录，检查 checksum 格式、重复项、缺失项和额外项，并重算每个归档的 SHA-256：

| Artifact                                            | SHA-256                                                            | 结果 |
| --------------------------------------------------- | ------------------------------------------------------------------ | ---- |
| `aioncore-v0.2.13-x86_64-unknown-linux-gnu.tar.gz`  | `cc01675b13ffb19040eed9ea9dc13eb3dd7d139cc0bff0301dda22f668afe138` | PASS |
| `aioncore-v0.2.13-aarch64-unknown-linux-gnu.tar.gz` | `c361e3b237992b5476b048b56f3afd5c1bcd8034f96f00fdabbaa06bc324a988` | PASS |
| `aioncore-v0.2.13-x86_64-apple-darwin.tar.gz`       | `1f61addc4ac38ff7dc912d05b2aa7cf2ca61da3aef4802fe876814e43a4ae2a7` | PASS |
| `aioncore-v0.2.13-aarch64-apple-darwin.tar.gz`      | `2bcc7def5d58c2e1f2bb17acd82d574c5b3cb3cd5d3ad4c855c3bad1072e2d14` | PASS |
| `aioncore-v0.2.13-x86_64-pc-windows-msvc.zip`       | `25d69a63dadafa2cbb87d94228256ca70c6efa177714bf3bd7838ebbee7d3e15` | PASS |
| `aioncore-v0.2.13-aarch64-pc-windows-msvc.zip`      | `84cf68f350ec8930a94f2e59cdebf23c4e1d31fd3ec3201e1b37ea01abc62282` | PASS |

WorkMate 当前平台的真实下载记录：

```text
URL: https://github.com/suoak/AionCore/releases/download/v0.2.13/aioncore-v0.2.13-x86_64-pc-windows-msvc.zip
artifact: aioncore-v0.2.13-x86_64-pc-windows-msvc.zip
expected SHA-256: 25d69a63dadafa2cbb87d94228256ca70c6efa177714bf3bd7838ebbee7d3e15
actual SHA-256:   25d69a63dadafa2cbb87d94228256ca70c6efa177714bf3bd7838ebbee7d3e15
result: PASS; source=download; installed binary reports aioncore 0.2.13
```

`prepare-aioncore.js` 的缺失 checksum 文件、缺失 artifact 项、无效格式和 checksum mismatch 均 fail closed；完整性错误不会降级为未校验的本地 binary fallback。

## WorkMate 验证

- 分支：`build/aioncore-v0.2.13`
- checksum fail-closed commit：`3ce6dbde6`
- pin commit：`df949fbad`（`package.json#aioncoreVersion = v0.2.13`）
- packaged smoke test commit：`b441b6c0a`
- TypeScript：PASS
- i18n types / consistency：PASS
- 相关 Vitest：29 PASS，3 SKIP
- 完整 Vitest：560 files PASS、1 SKIP；5512 tests PASS、12 SKIP
- Electron production build：PASS
- Windows x64 packaged build：PASS
- unpacked app：`out/win-unpacked/CSBU WorkMate.exe`
- installer：`out/CSBU-WorkMate-2.3.0-win-x64.exe`

Packaged smoke 使用真实 packaged exe、AionCore v0.2.13 和一次性 user-data sandbox，结果如下：

| 场景                                                                    | 结果                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------- |
| Existing Conversation 打开                                              | PASS                                            |
| Agent stream / complete                                                 | PASS                                            |
| Plan reject 后不可执行                                                  | PASS                                            |
| Plan approve 后只能 claim/run 一次                                      | PASS                                            |
| running 重启后变为 paused、无 replay                                    | PASS                                            |
| waiting approval 重启后按设计变为 paused，approval 仍 pending、run 为 0 | PASS                                            |
| Goal 部分 criteria passed 时不 completed；全部 passed 后 completed      | PASS                                            |
| Codex 实际执行                                                          | PASS                                            |
| MCP endpoint（2 个已配置 server）                                       | PASS                                            |
| Agent Center / Workflow / Skill Evolution 打开                          | PASS                                            |
| Claude / Aion Agent catalog                                             | PRESENT；未单独执行 live turn                   |
| CodeBuddy CLI                                                           | 2.154.0 可运行，但 live turn 因未登录而 BLOCKED |

## 唯一外部阻塞

CodeBuddy 是本门禁的必选 smoke 项。本机没有 `codebuddy` 原生命令，但标准 `npx -y --package @tencent-ai/codebuddy-code codebuddy` 路径可下载并运行；执行最小无工具 live prompt 时返回认证错误。完成 CodeBuddy 登录后，需要重新运行 CodeBuddy packaged live turn（send / stream / complete）。在该项实际 PASS 前：

```text
M1.5 = BLOCKED_EXTERNAL
```

不得因为其他项目已通过而标记 `CLOSED`，也不得开始 M3。
