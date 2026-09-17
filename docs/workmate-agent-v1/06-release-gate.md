# M1.5 Release Gate

> 状态：`BLOCKED_EXTERNAL`。代码准备可以在本地完成，但发布、tag、WorkMate pin 与打包 smoke 必须在 AionCore CI 绿灯和公开 Release 存在后执行。本轮不创建 tag、不发布、不修改 pin。

## 版本与范围

- 当前 AionCore manifest：`0.2.12`；WorkMate `package.json#aioncoreVersion`：`v0.2.12`。
- `release-please-config.json` 使用 `simple` release、`include-v-in-tag: true`，且 pre-1.0 feature 采用 patch bump；因此建议版本为 `0.2.13`，tag 为 `v0.2.13`。
- 变更 crate：`aionui-api-types`、`aionui-db`、`aionui-conversation`、`aionui-app`。本次没有增加 crate。
- 数据库升级：`059 -> 060` 新增 `task_sessions`；`060 -> 061` 新增 Plan/Goal artifact、approval、run、acceptance criterion 表。已有 migration 未被修改。
- AionCore 候选提交：`8ca310e9`（M1/M2 执行合同与并发测试）、`790a91fa`（显式 workspace CI 门禁）。提交仅存在于本地，尚未 push。

## 本机证据与阻塞

- `cargo fmt --all -- --check`：可运行。
- `scripts/migration/check-immutability.test.ps1` 与 `check-immutability.ps1`：通过。
- `cargo check -p aionui-api-types -p aionui-db -p aionui-conversation`：在编译依赖 build script 前被环境阻塞，明确错误为 MSVC `link.exe` 不存在。
- Docker daemon、WSL 与 `bash` 均不可用。虽然安装了 GNU Rust target/toolchain，现有 MinGW 8.1 SJLJ 与 Rust 1.95 的 unwind ABI 不兼容，GNU check 同样在链接 build script 时失败。该结果不是测试通过，不能作为发布绿灯。

## CI / 构建机必须通过

在 AionCore PR/commit 上执行 `.github/workflows/ci.yml` 的完整门禁：

```text
cargo fmt --all -- --check
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo nextest run --workspace
cargo test --workspace
bash scripts/migration/check-immutability.test.sh
bash scripts/migration/check-immutability.sh
```

重点验收：fresh DB、`059 -> 060 -> 061`、TaskSession CRUD/归属、状态机、重启只暂停不重放、artifact 版本与 hash 绑定、跨用户拒绝、Plan/Goal 路由。并发审批和并发执行测试使用文件型 SQLite 多连接池；同一个 pending approval 或 execution contract 只能有一个请求成功，失败方必须得到 conflict，且数据库中只能存在一个 run。

## Release 产物

CI 绿后由 release-please 生成版本提交和 `v0.2.13` tag；`.github/workflows/release.yml` 必须成功产出：

- `aioncore-v0.2.13-x86_64-unknown-linux-gnu.tar.gz`
- `aioncore-v0.2.13-aarch64-unknown-linux-gnu.tar.gz`
- `aioncore-v0.2.13-x86_64-apple-darwin.tar.gz`
- `aioncore-v0.2.13-aarch64-apple-darwin.tar.gz`
- `aioncore-v0.2.13-x86_64-pc-windows-msvc.zip`
- `aioncore-v0.2.13-aarch64-pc-windows-msvc.zip`
- `aioncore-checksums.txt`

Release notes 至少列出：TaskSession migration/API、不可变 Plan/Goal artifact、approval hash 绑定、一次性 run、Goal 验收证据、启动恢复不重放，以及 WorkMate 需要升级 pin。

## WorkMate pin 与 smoke

只有公开 Release 的六个平台归档和 checksum 均存在后，才把 `package.json#aioncoreVersion` 从 `v0.2.12` 改为 `v0.2.13`。`scripts/resolveAioncoreVersion.js` 与 `scripts/prepareAioncore.js` 会消费该唯一 pin；不得用分支构建或本地二进制伪装正式依赖。

pin PR 的 smoke 矩阵：

1. x64/arm64 目标分别下载 archive，并按 `aioncore-checksums.txt` 校验。
2. 全新 profile 启动 WorkMate，确认 Core ready、migration 到 061；分别验证 Codex、CodeBuddy、Aion Agent、Claude 的普通 Agent 对话与 MCP 工具调用。
3. 旧的 059 数据库升级后创建/更新/重启 TaskSession，确认无自动消息或工具重放。
4. Plan 提交、拒绝、重新提交、批准、执行；篡改 artifact/hash、重复批准、重复执行均失败。
5. Goal 锁定目标/标准，执行后未验证保持 paused，全部 passed 后 completed。

Release Gate 关闭条件是：AionCore CI 绿、Release 公开且产物完整、WorkMate pin PR 合入、目标平台 smoke 有记录。当前四项均未完成，不能声称 M1.5 发布完成。
