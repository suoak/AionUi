# Automatic planning validation

## Required evidence

M3 is considered closed only when runtime-path tests, repository gates, the AionCore release, the formal WorkMate pin, and a packaged WorkMate smoke all pass. A unit test that calls only the isolation resolver is not sufficient.

## AionCore focused tests

The Aion agent tests build a real `AgentBootstrap` with a scripted provider and exercise the same `AgentEngine` and orchestration path used by WorkMate.

| Scenario                                 | Expected evidence                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Read an existing file                    | Successful tool result contains the file content                            |
| Allowlisted `Write` attempt              | `policy_denied`; content and file list unchanged                            |
| Allowlisted `Edit` attempt               | `policy_denied`; content and file list unchanged                            |
| Allowlisted `ExecCommand` attempt        | `policy_denied`; content and file list unchanged                            |
| Skill / Spawn / ToolSearch attempt       | `policy_denied`; content and file list unchanged                            |
| Unknown alias attempt                    | Error result; sentinel unchanged                                            |
| Configured hooks and MCP                 | Removed before bootstrap; no process/tool registered                        |
| Registry completeness                    | Actual registered tool count equals classified tool count                   |
| Runtime policy transition                | Existing engines are rebuilt in both unrestricted/strict directions         |
| Aion automatic plan                      | Strict runtime option captured; immutable plan and pending approval created |
| Aion identity on a non-Aion conversation | `UNSUPPORTED`; automatic planning rejected                                  |

The mutation prompts deliberately instruct the model to ignore plan mode. Passing therefore demonstrates runtime enforcement rather than prompt compliance.

## WorkMate tests

- The frontend helper enables automatic planning only when both `level == guaranteed` and `automatic_planning_enabled == true`.
- Malformed `BEST_EFFORT` or `UNSUPPORTED` responses that set the enable flag still fail closed.
- Missing isolation evidence fails closed.
- i18n validation requires all planning labels in every configured locale.

## Local commands

```bash
# AionCore
cargo fmt --all -- --check
cargo test -p aionui-ai-agent strict_planning
cargo test -p aionui-conversation automatic_planning

# WorkMate
bun run format
bun run lint
bunx tsc --noEmit
bun run i18n:types
node scripts/check-i18n.js
bunx vitest run tests/unit/common-adapter/taskSessionPlanning.test.ts
```

## Remote CI and release gate

The AionCore M3 release must pass:

```text
fmt
check
clippy
nextest / cargo test
migration immutability
```

The formal WorkMate pin may change only after the release assets and checksums exist. M3 may close only after a packaged WorkMate built from that pin passes the strict-planning release gate.

## Result recording

Local validation on 2026-10-05:

| Check                                                                     | Result                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `cargo fmt --all -- --check`                                              | Passed                                                                               |
| Aion runtime policy-transition test                                       | Passed: 1 test                                                                       |
| `cargo test -p aionui-ai-agent strict_planning`                           | Passed: 4 tests                                                                      |
| `cargo test -p aionui-conversation automatic_planning`                    | Passed: 2 tests                                                                      |
| WorkMate changed-file `oxfmt --check` and `oxlint --quiet`                | Passed                                                                               |
| `node scripts/check-i18n.js`                                              | Passed for all 13 locales and generated key types                                    |
| `vitest run tests/unit/common-adapter/taskSessionPlanning.test.ts`        | Passed in GitHub Push Checks; local checkout has no installed workspace dependencies |
| WorkMate TypeScript, complete unit suite, and repository-wide lint/format | Passed in GitHub Push Checks                                                         |

Remote validation on 2026-10-05:

- [AionCore CI run 37283736988](https://github.com/suoak/AionCore/actions/runs/37283736988): passed, including migration immutability, format, clippy, check, nextest, and cargo test.
- [AionCore Native Presentation run 37283737003](https://github.com/suoak/AionCore/actions/runs/37283737003): passed.
- [WorkMate Push Checks run 37283723416](https://github.com/suoak/AionUi/actions/runs/37283723416): passed, including lint, format, TypeScript, i18n, and unit tests.

Release integration on 2026-10-05:

- [AionCore PR #131](https://github.com/suoak/AionCore/pull/131) corrected the shipped ACP-backed Codex and Claude identities to their audited `BEST_EFFORT` profiles while leaving CodeBuddy/generic ACP `UNSUPPORTED`.
- [AionCore CI run 37312288344](https://github.com/suoak/AionCore/actions/runs/37312288344) passed format, check, clippy, migration immutability, nextest, and cargo test after the correction.
- [AionCore v0.2.14](https://github.com/suoak/AionCore/releases/tag/v0.2.14) points to `b81c4ff5366cf8d430b1ebaadb8f01d2f03086ec`.
- [AionCore release run 37323958369](https://github.com/suoak/AionCore/actions/runs/37323958369) built and uploaded all six platform artifacts plus `aioncore-checksums.txt`.
- WorkMate pin commit `e4bfabaec` changes only `aioncoreVersion` to v0.2.14 with subject `build: bump AionCore to v0.2.14`.
- [WorkMate packaged gate run 37327844025](https://github.com/suoak/AionUi/actions/runs/37327844025) passed the Windows x64 packaged strict-planning test and the normal install smoke alongside Linux and macOS builds.

Verified release assets:

| Artifact                                            | Bytes    | SHA-256                                                            |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `aioncore-v0.2.14-x86_64-unknown-linux-gnu.tar.gz`  | 46638653 | `4c450ecbd84568981de59ddfba56a0ca1fd8a4b53f54a13f064f4f5dd755a2df` |
| `aioncore-v0.2.14-aarch64-unknown-linux-gnu.tar.gz` | 45996344 | `d12963c8725602efde0e54cbbe800d4d94c9358d8ab53a2525c7e33134de8546` |
| `aioncore-v0.2.14-x86_64-apple-darwin.tar.gz`       | 44656892 | `57bae84f6b4f59cf68fbbcee53d313d71e7fce6e9cd3a5014b2abdc99c617ad5` |
| `aioncore-v0.2.14-aarch64-apple-darwin.tar.gz`      | 42864059 | `b6f562ab76cdd9182c28e2b525530932e74f05f7fec2ef74ec8e234da5376aa3` |
| `aioncore-v0.2.14-x86_64-pc-windows-msvc.zip`       | 43120888 | `b019ed059a874cb9feb95c525222f13d66c13d31ca06472a11e9f847b7c89dc2` |
| `aioncore-v0.2.14-aarch64-pc-windows-msvc.zip`      | 40539820 | `31e18fd4eb9bffd902955b996b7b5a971f98e8e2f3c395063fa8111cda067618` |

Every asset was non-empty, and every GitHub asset digest matched its row in `aioncore-checksums.txt`.

The packaged gate proves the following against WorkMate plus the released AionCore v0.2.14 binary:

- Normal Aion planning can read the workspace, creates an immutable plan, and stops at `waiting_approval` without mutation.
- Malicious write attempts are denied and the sentinel hash remains unchanged.
- Unknown tools are denied without fallback execution.
- Approval is artifact-hash-bound and execution has a single claim.
- Restart converts an interrupted planning task to `paused`, creates no run or approval, performs no mutation, and retains the guaranteed planning policy.
- Codex and Claude report `BEST_EFFORT`; CodeBuddy reports `UNSUPPORTED`; automatic planning is disabled by both backend and UI for all three.

Final state:

```text
M3 = CLOSED
Automatic Planning = ENABLED_FOR_GUARANTEED_ONLY
```
