# Automatic planning validation

## Required evidence

M3.2 is considered valid only when runtime-path tests and repository gates pass. A unit test that calls only the isolation resolver is not sufficient.

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

## Remote CI gate

The AionCore M3 development branch must pass:

```text
fmt
check
clippy
nextest / cargo test
migration immutability
```

Do not publish a new AionCore version or change the formal WorkMate AionCore pin until the Aion strict tests, automatic-planning smoke path, and all required CI jobs are green.

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

These runs validate the development branches only. Release readiness still requires the normal review and release decision; no AionCore release or formal WorkMate pin change is part of M3.2 implementation.
