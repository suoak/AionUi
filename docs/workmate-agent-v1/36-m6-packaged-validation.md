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

This document freezes the one Windows x64 package that may be used for the joint M6 real-account acceptance. Cloud fixtures and packaged smoke tests are complete. Gates that require a real ChatGPT account remain pending and must not be inferred from fixture evidence.

## Acceptance candidate identity

| Field                       | Frozen value                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Acceptance preparation date | 2026-10-07                                                                           |
| Operating system            | Windows x64 (`windows-2022` build and fresh-install smoke runner)                    |
| WorkMate version            | `2.3.0`                                                                              |
| WorkMate commit             | `34f83ef7737079a6a3d607a5a3135ae71f85b14d`                                           |
| WorkMate main gate          | [Push Checks 37624317056](https://github.com/suoak/AionUi/actions/runs/37624317056)  |
| WorkMate package workflow   | [Manual Build 37624382086](https://github.com/suoak/AionUi/actions/runs/37624382086) |
| Package artifact            | `windows-build-x64-34f83ef` (`11483529431`)                                          |
| Package artifact SHA-256    | `061806d2a3a5bfb951a6f0d221414ba58dcc60930d28c5aba3c317370d573892`                   |
| Installer filename          | `CSBU-WorkMate-2.3.0-win-x64.exe`                                                    |
| Installer size              | `204220375` bytes                                                                    |
| Installer SHA-256           | `2d6daaa1660b8415b9d82725f38550f9541e9f4d80331efa2f59f50e4b3ab3b2`                   |
| Installer file version      | `2.3.0`                                                                              |
| AionCore version            | `v0.2.16`                                                                            |
| AionCore release tag        | [`v0.2.16`](https://github.com/suoak/AionCore/releases/tag/v0.2.16)                  |
| AionCore release commit     | `1c59adf182775fb3a39addad2a37f4e2768e81d5`                                           |
| AionCore release workflow   | [Release 37620450285](https://github.com/suoak/AionCore/actions/runs/37620450285)    |
| Codex version               | `PENDING` — record the packaged runtime's diagnostic value during real acceptance    |
| Auth mode                   | Codex-managed ChatGPT OAuth; real result `PENDING`                                   |

The manual build used `branch=main`, `platform=windows-x64`, `skip_code_quality=false`, no version override, and an empty `aioncore_run_id`. The candidate therefore resolves the stable `v0.2.16` release pin and does not contain a feature-branch, local-replacement, or temporary CI AionCore binary.

## Release integration evidence

### AionCore main and release

| Gate                         | Evidence                                                                                               | Result                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| M6.4 implementation          | PR [#139](https://github.com/suoak/AionCore/pull/139)                                                  | Merged into the stacked M6.3 branch                     |
| M6 main integration          | PR [#138](https://github.com/suoak/AionCore/pull/138), main `45379501ad1efa736ccbf75a6c85ea78e9847e0b` | Merged; M6.1–M6.4 runtime changes present               |
| Merged-main CI               | [CI 37617135563](https://github.com/suoak/AionCore/actions/runs/37617135563)                           | Passed                                                  |
| Merged-main native matrix    | [Native Presentation 37617135505](https://github.com/suoak/AionCore/actions/runs/37617135505)          | Passed on the configured Windows/macOS/Linux matrix     |
| Release PR                   | PR [#140](https://github.com/suoak/AionCore/pull/140)                                                  | `v0.2.16` release metadata and Cargo lock update merged |
| Release commit CI            | [CI 37620423487](https://github.com/suoak/AionCore/actions/runs/37620423487)                           | Passed                                                  |
| Release commit native matrix | [Native Presentation 37620423481](https://github.com/suoak/AionCore/actions/runs/37620423481)          | Passed                                                  |
| Official release             | [Release 37620450285](https://github.com/suoak/AionCore/actions/runs/37620450285)                      | Passed; six platform archives and checksums published   |

The release contains:

- `aioncore-v0.2.16-aarch64-apple-darwin.tar.gz`
- `aioncore-v0.2.16-x86_64-apple-darwin.tar.gz`
- `aioncore-v0.2.16-aarch64-pc-windows-msvc.zip`
- `aioncore-v0.2.16-x86_64-pc-windows-msvc.zip`
- `aioncore-v0.2.16-aarch64-unknown-linux-gnu.tar.gz`
- `aioncore-v0.2.16-x86_64-unknown-linux-gnu.tar.gz`
- `aioncore-checksums.txt`

All six archive hashes in `aioncore-checksums.txt` exactly matched GitHub's SHA-256 digest for the corresponding uploaded release asset. The Windows x64 archive hash is `703968556f892fc30f8511d52a2fe137a916be8286a5754eca249abb1c950efd`. WorkMate's checksum-mismatch behavior remains fail closed.

### WorkMate pin and package

| Gate                          | Evidence                                                                                               | Result                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Independent stable pin        | PR [#169](https://github.com/suoak/AionUi/pull/169), commit `056ceec24d11d769a218408d1692efd4caa82e3d` | Only `aioncoreVersion: v0.2.15 -> v0.2.16`                                                                                  |
| Pin Push Checks               | [37622792758](https://github.com/suoak/AionUi/actions/runs/37622792758)                                | Passed                                                                                                                      |
| Pin PR Checks                 | [37622827075](https://github.com/suoak/AionUi/actions/runs/37622827075)                                | Code quality, i18n, coverage, release scripts, multi-platform tests/builds, Windows packaged gate, and install smoke passed |
| Final WorkMate main           | `34f83ef7737079a6a3d607a5a3135ae71f85b14d`                                                             | Clean and synchronized with `origin/main` at candidate creation                                                             |
| Final main gate               | [37624317056](https://github.com/suoak/AionUi/actions/runs/37624317056)                                | Passed                                                                                                                      |
| Stable AionCore preparation   | final package job in [37624382086](https://github.com/suoak/AionUi/actions/runs/37624382086)           | Passed using the official release pin                                                                                       |
| Windows production build      | same workflow                                                                                          | Passed                                                                                                                      |
| Packaged strict-planning gate | same workflow                                                                                          | Passed                                                                                                                      |
| Fresh-install smoke           | same workflow                                                                                          | Passed                                                                                                                      |

The fresh-install diagnostics artifact is `windows-installer-diagnostics-x64-fresh-34f83ef` (`11484127763`) with SHA-256 `4de2ac7e6826fbeb30286bc168d4cfd84459b3e616ead7ce58efa2b1276baf2a`. Its status records `Mode: fresh` and a successful finish. A scan of its status, process, and volume diagnostics found no access token, refresh token, ID token, bearer header, cookie, OAuth code/state, or credential pattern.

## Joint real-account acceptance

Use only the installer identified above. Any code change, AionCore release change, WorkMate commit change, or rebuilt installer with a different hash invalidates this candidate.

| Gate                          | Required evidence                                                                                                                  | Status                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0 — Fresh install             | Packaged WorkMate, AionCore, and Codex app-server start; initial auth state recorded; no development dependency or credential leak | `PACKAGED SMOKE PASS / REAL ENVIRONMENT PENDING` |
| 1 — ChatGPT OAuth             | `SIGNED_OUT -> AUTHENTICATING -> SIGNED_IN`, official browser flow, final state confirmed by `account/read`                        | `PENDING`                                        |
| 2 — Live authentication probe | Exact response `WORKMATE_CODEX_AUTH_OK`                                                                                            | `PENDING`                                        |
| 3 — Real model catalog        | `model/list` returns at least one selectable model; count, paging, Auto/default, and efforts recorded                              | `PENDING`                                        |
| 4 — Explicit model selection  | One advertised model and supported effort execute a real turn; requested and selected values agree                                 | `PENDING`                                        |
| 5 — Review evidence           | Review records Codex runtime, actual effective model, and actual reasoning value                                                   | `PENDING`                                        |
| 6 — Multi-turn same thread    | Probe `WORKMATE-M6-REAL-7391` survives a second turn and Thread ID remains unchanged                                               | `PENDING`                                        |
| 7 — WorkMate restart          | Entire packaged application restarts; app-server generation changes while the task and binding remain                              | `PENDING`                                        |
| 8 — Native resume             | Recovery uses `thread/resume {threadId}` and not a new thread plus conversation replay                                             | `PENDING`                                        |
| 9 — Semantic resume           | Exact probe is returned after restart and Thread ID is identical                                                                   | `PENDING`                                        |
| 10 — Resume effective model   | Runtime-returned effective model is reconciled with UI/Review after resume                                                         | `PENDING`                                        |
| 11 — Real rate limits         | `account/rateLimits/read` fields recorded with sensitive values minimized; null allowance displays `UNKNOWN`                       | `PENDING`                                        |
| 12 — Real account usage       | Provider fields recorded, or legitimately `UNAVAILABLE` without auth/runtime failure                                               | `PENDING`                                        |
| 13 — Thread usage             | Active Thread ID and returned input/cached/output/reasoning/total counters recorded; absent values remain null                     | `PENDING`                                        |
| 14 — Diagnostics              | Installed/version/app-server/protocol/auth/account/models/limits/usage/workspace/resume checks use `PASS/WARN/FAIL/NOT_APPLICABLE` | `PENDING`                                        |
| 15 — Logout                   | `account/logout -> account/read -> SIGNED_OUT`                                                                                     | `PENDING`                                        |
| 16 — Logout invalidation      | Account, model, rate-limit, and usage snapshots no longer appear valid for the old account                                         | `PENDING`                                        |
| 17 — Post-logout execution    | New Codex turn fails as `NOT_AUTHENTICATED` and offers ChatGPT login                                                               | `PENDING`                                        |
| 18 — Secret scan              | Logs, Trace, Review, diagnostics, persisted state, and installer diagnostics contain no credentials or full auth URL               | `PENDING`                                        |

Deliberately exhausting a real account is not required. The `RATE_LIMITED -> late completed -> terminal failure/no replay` race remains covered by the M6.4 regression fixture.

## Closure ledger

```text
M6.1 real OAuth/inference/restart/logout gates = PENDING
M6.2 real multi-turn/native-resume/semantic-resume gates = PENDING
M6.3 real catalog/selection/effective-model gates = PENDING
M6.4 real limits/usage/diagnostics/invalidation gates = PENDING

M6 = OPEN
```

No M6 status may be changed to `CLOSED` until one end-to-end run of this exact candidate completes all applicable gates. Optional provider endpoints may produce a documented `WARN` or `NOT_APPLICABLE`; core authentication, model catalog, session continuity, live inference, native resume, logout, and security gates may not be downgraded.
