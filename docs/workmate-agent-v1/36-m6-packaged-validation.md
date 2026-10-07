# M6 Final Packaged Validation

## Status

```text
M6.1 = IMPLEMENTED / RELEASE INTEGRATED / REAL AUTH ACCEPTANCE PENDING
M6.2 = IMPLEMENTED / RELEASE INTEGRATED / REAL SESSION ACCEPTANCE PENDING
M6.3 = IMPLEMENTED / RELEASE INTEGRATED / REAL MODEL ACCEPTANCE PENDING
M6.4 = IMPLEMENTED / RELEASE INTEGRATED / REAL USAGE ACCEPTANCE PENDING

M6 = OPEN
M7 = NOT STARTED
```

This document freezes the official WorkMate `v2.4.0` Windows x64 package for the joint M6 real-account acceptance. Cloud fixtures, multi-platform builds, and packaged smoke gates establish the candidate; they do not substitute for a real ChatGPT account.

## Acceptance candidate identity

| Field                               | Frozen value                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Acceptance preparation date         | 2026-10-08                                                                                |
| Operating system                    | Windows x64                                                                               |
| WorkMate version                    | `2.4.0`                                                                                   |
| WorkMate release commit             | `d7e6961838fb3348fd9f4e380ad4a4808eb893bb`                                                |
| WorkMate tag                        | `v2.4.0`                                                                                  |
| WorkMate merged-main gate           | [Push Checks 37651166730](https://github.com/suoak/AionUi/actions/runs/37651166730)       |
| WorkMate release workflow           | [Build and Release 37651991570](https://github.com/suoak/AionUi/actions/runs/37651991570) |
| WorkMate final-asset workflow       | [Build and Release 37660674214](https://github.com/suoak/AionUi/actions/runs/37660674214) |
| WorkMate release URL                | [`v2.4.0`](https://github.com/suoak/AionUi/releases/tag/v2.4.0)                           |
| Windows installer                   | `CSBU-WorkMate-2.4.0-win-x64.exe`                                                         |
| Installer size                      | `204187617` bytes                                                                         |
| Installer SHA-256                   | `e8584f4581e6e4d8842e377f8607cd645bac983b2b57724c48e1353863fc71c9`                        |
| AionCore version                    | `v0.2.17`                                                                                 |
| AionCore release commit             | `6fa1d3e83f8f8ec1cf07b74dd092d7f122e6ab10`                                                |
| AionCore release                    | [`v0.2.17`](https://github.com/suoak/AionCore/releases/tag/v0.2.17)                       |
| AionCore release workflow           | [Release 37642048121](https://github.com/suoak/AionCore/actions/runs/37642048121)         |
| Codex distribution                  | Not bundled; WorkMate resolves the user-installed `codex` executable from `PATH`          |
| Codex protocol baseline             | `0.160.1`, the release against which the direct app-server contract was verified          |
| Codex version on acceptance machine | `PENDING` — record `codex --version` during real acceptance                               |
| Auth mode                           | Codex-managed ChatGPT OAuth; real result `PENDING`                                        |

The candidate is built only from the official `v2.4.0` tag. A local build, feature-branch binary, previous artifact, or package with a different SHA-256 is not this candidate.

## Release integration evidence

### AionCore

| Gate                               | Evidence                                                                          | Result                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Conversation-delete implementation | PR [#141](https://github.com/suoak/AionCore/pull/141)                             | Merged as `b3cfa6479d4ddbd7847319ec91eb034948d844ee`           |
| Core implementation CI             | [CI 37635198116](https://github.com/suoak/AionCore/actions/runs/37635198116)      | Passed                                                         |
| Core release PR                    | PR [#142](https://github.com/suoak/AionCore/pull/142)                             | Passed and merged                                              |
| Core release                       | [Release 37642048121](https://github.com/suoak/AionCore/actions/runs/37642048121) | Passed; six platform archives plus checksum manifest published |
| Release integrity                  | `aioncore-checksums.txt` compared with GitHub asset digests                       | All six SHA-256 values matched                                 |

The Windows x64 AionCore archive is `aioncore-v0.2.17-x86_64-pc-windows-msvc.zip` with SHA-256 `f2eb06d244933fb355c0ae5dd66c0d34d1fcc90bda82585079568f8829d4290a`.

### WorkMate

| Gate                         | Evidence                                                                                                        | Result                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Delete and version PR        | PR [#171](https://github.com/suoak/AionUi/pull/171)                                                             | Passed and merged                                                                                |
| PR validation                | [PR Checks 37635922590, attempt 2](https://github.com/suoak/AionUi/actions/runs/37635922590/attempts/2)         | Code quality, coverage, i18n, release scripts, unit tests, and Linux/macOS/Windows builds passed |
| Merged-main validation       | [Push Checks 37644871014](https://github.com/suoak/AionUi/actions/runs/37644871014)                             | Passed                                                                                           |
| Release changelog repair     | PR [#172](https://github.com/suoak/AionUi/pull/172)                                                             | Packaging-only repair; passed and merged                                                         |
| Final merged-main validation | [Push Checks 37651166730](https://github.com/suoak/AionUi/actions/runs/37651166730)                             | Passed                                                                                           |
| Official release build       | [Build and Release 37651991570, attempt 2](https://github.com/suoak/AionUi/actions/runs/37651991570/attempts/2) | Passed; all platform builds and both Windows fresh-install smoke jobs passed                     |
| Release-event final assets   | [Build and Release 37660674214](https://github.com/suoak/AionUi/actions/runs/37660674214)                       | Passed; signing self-check, all builds, both Windows install smokes, and final upload passed     |

The first release attempt [37645778050](https://github.com/suoak/AionUi/actions/runs/37645778050) built every platform and passed both Windows fresh-install smoke jobs, then failed closed before creating a release because `CHANGELOG.md` lacked the `2.4.0` section. PR #172 repaired only that packaging metadata. No package from the failed attempt is an acceptance candidate.

The successful release published 31 assets. Publication triggered the configured release-event workflow, which rebuilt and replaced the release assets once. The frozen identity above is the final public asset produced by that completed workflow, not the superseded initial upload.

The final Windows x64 installer was independently downloaded after workflow `37660674214` completed. Its byte size and SHA-256 matched GitHub's asset metadata, and its independently computed SHA-512 matched the final public `latest.yml` entry. The workflow's signing step also verified every generated manifest/signature pair with the configured Ed25519 public key before the final upload.

## Conversation delete release inclusion

WorkMate `v2.4.0` restores the destructive Recent Conversation action after Rename, Pin/Unpin, and Archive. It requires explicit confirmation and delegates to `conversation.remove -> DELETE /api/conversations/:id`.

Deletion fails closed while the runtime or M4 task aggregate is active. Completed WorkMate-owned task runs are deleted before their task-session root so restrictive artifact and approval references cannot leave partial state; trace, review, checkpoint, evidence, context snapshot, runtime binding, approval, artifact, and criteria descendants are then removed by the authoritative transaction and schema cascades. Codex credentials, rollout files, and private thread storage are outside WorkMate ownership and are never deleted.

The ownership and foreign-key audit is recorded in [38-conversation-delete-hotfix.md](./38-conversation-delete-hotfix.md).

## Joint real-account acceptance

Use only the installer and SHA-256 frozen above. Any code change, tag move, AionCore release change, or rebuilt installer invalidates this candidate and requires a new patch release.

| Gate                          | Required evidence                                                                                                            | Status                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0 — Fresh install             | Packaged WorkMate and AionCore start; user-installed Codex version is recorded; no development dependency or credential leak | `PACKAGED CLOUD PASS / REAL ENVIRONMENT PENDING` |
| 1 — ChatGPT OAuth             | `SIGNED_OUT -> AUTHENTICATING -> SIGNED_IN`; official browser flow; authoritative `account/read`                             | `PENDING`                                        |
| 2 — Live authentication probe | Exact response `WORKMATE_CODEX_AUTH_OK`                                                                                      | `PENDING`                                        |
| 3 — Real model catalog        | `model/list` returns selectable models; paging, Auto/default, and efforts recorded                                           | `PENDING`                                        |
| 4 — Explicit model selection  | An advertised model and supported effort complete a real turn                                                                | `PENDING`                                        |
| 5 — Review evidence           | Review records Codex runtime and actual effective model/reasoning                                                            | `PENDING`                                        |
| 6 — Multi-turn same thread    | Probe `WORKMATE-M6-REAL-7391` survives a second turn and Thread ID is unchanged                                              | `PENDING`                                        |
| 7 — WorkMate restart          | Packaged app restarts while task and persisted runtime binding remain                                                        | `PENDING`                                        |
| 8 — Native resume             | Recovery uses `thread/resume {threadId}`, not transcript replay                                                              | `PENDING`                                        |
| 9 — Semantic resume           | Exact probe is returned after restart and Thread ID is identical                                                             | `PENDING`                                        |
| 10 — Resume effective model   | Runtime-returned effective model is reconciled with UI and Review                                                            | `PENDING`                                        |
| 11 — Real rate limits         | Provider fields recorded; null allowance displays `UNKNOWN`                                                                  | `PENDING`                                        |
| 12 — Real account usage       | Provider fields recorded or legitimately `UNAVAILABLE` without auth/runtime failure                                          | `PENDING`                                        |
| 13 — Thread usage             | Thread ID and input/cached/output/reasoning/total counters recorded                                                          | `PENDING`                                        |
| 14 — Diagnostics              | Installed/version/app-server/protocol/auth/account/models/limits/usage/workspace/resume checks use stable verdicts           | `PENDING`                                        |
| 15 — Logout                   | `account/logout -> account/read -> SIGNED_OUT`                                                                               | `PENDING`                                        |
| 16 — Logout invalidation      | Account, model, rate-limit, and usage snapshots are invalidated                                                              | `PENDING`                                        |
| 17 — Post-logout execution    | A new Codex turn fails as `NOT_AUTHENTICATED` and offers ChatGPT login                                                       | `PENDING`                                        |
| 18 — Secret scan              | Logs, Trace, Review, diagnostics, persisted state, and installer diagnostics contain no credentials or full auth URL         | `PENDING`                                        |

Deliberately exhausting a real account is not required. The `RATE_LIMITED -> late completed -> terminal failure/no replay` race remains fixture-covered.

## Closure ledger

```text
M6.1 real OAuth/inference/restart/logout gates = PENDING
M6.2 real multi-turn/native-resume/semantic-resume gates = PENDING
M6.3 real catalog/selection/effective-model gates = PENDING
M6.4 real limits/usage/diagnostics/invalidation gates = PENDING

M6 = OPEN
M7 = NOT STARTED
```

No M6 status may be changed to `CLOSED` until one end-to-end run of this exact published candidate completes all applicable gates.
