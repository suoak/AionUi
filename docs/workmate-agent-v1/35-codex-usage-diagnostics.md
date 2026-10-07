# M6.4 Codex Usage, Rate Limits, and Diagnostics

## Status

```text
M6.4 = IMPLEMENTED / CLOUD AND PACKAGED FIXTURE VERIFIED / REAL USAGE ACCEPTANCE PENDING
M6   = OPEN
```

Real-account usage acceptance remains pending and will be combined with M6.5 acceptance. This slice does not start M7.

## Baseline audit

The audit started from the M6.3 heads and Codex CLI `0.160.1` generated schemas in
`protocols/samples/codex-cli/0.160.1/schema-full/v2/`:

| Domain               | Protocol authority                                                               | Pre-M6.4 WorkMate state                                                                     | M6.4 decision                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Account allowance    | `GetAccountRateLimitsResponse.json`, `AccountRateLimitsUpdatedNotification.json` | M6.1 called the official method but exposed raw JSON and the UI assumed one bucket          | Stable projection, multiple buckets, tri-state permission, sparse merge plus debounced authoritative reread                        |
| Account activity     | `GetAccountTokenUsageResponse.json`                                              | Official response was exposed as raw JSON                                                   | Provider-reported summary/daily activity only; provider date boundaries are preserved                                              |
| Runtime thread usage | `ThreadTokenUsageUpdatedNotification.json`                                       | `last` fed the context indicator; cumulative `total`, Thread ID, and Turn ID were discarded | Preserve exact `total` and `last` snapshots separately, replace rather than sum, and bind to the active Thread ID                  |
| Diagnostics          | `ServerDiagnosticsParams.json`, `ServerDiagnosticsResponse.json`                 | Version/auth warnings existed, but no stable diagnostic model                               | Read-only structured checks with `PASS`, `WARN`, `FAIL`, and `NOT_APPLICABLE`                                                      |
| Runtime limit error  | `ErrorNotification.json`                                                         | Fatal errors ended a turn, but usage/rate-limit classes were not stable                     | Normalize structured or bounded-text usage/rate-limit failures to `RATE_LIMITED`; terminal failure wins over a trailing completion |

The generated schema explicitly states that `account/rateLimits/updated` is sparse and that missing nullable metadata must not clear previously observed values. It also states that `ordinaryUsageAllowed = null` is unavailable and must not be inferred from percentages or reset times. WorkMate follows those statements literally.

Private ChatGPT endpoints, Codex SQLite files, JSONL history, credential files, and unstable token-sharing APIs are not data authorities.

## Usage contract

The three usage domains stay separate:

1. Account allowance answers whether ordinary included usage is allowed and exposes provider rate-limit windows.
2. Account activity reports provider-owned token statistics and daily buckets. WorkMate does not infer billing, prices, costs, or timezone rebucketing.
3. Runtime thread usage reports the active thread's token counters. `total` is cumulative and `last` is the latest turn; they are never added together.

`thread/tokenUsage/updated` is accepted only when `threadId` equals the current Codex binding. Switching/resuming a different thread fences late notifications from the old thread. The current runtime snapshot is replaced in bounded session state. A TaskRun captures that latest snapshot at its existing finish boundary, so Review receives one boundary snapshot rather than a high-frequency notification trace.

The persisted Review shape contains:

- runtime type, Thread ID, and Turn ID;
- exact provider `total` and `last` counters;
- nullable model context window;
- `snapshot_semantics = replace`.

## Rate-limit contract

The renderer receives a WorkMate DTO, never raw provider JSON:

- `ordinary_usage_allowed: true | false | null`;
- `availability: AVAILABLE | LIMITED | BLOCKED | UNKNOWN`;
- a stable, ordered `buckets[]` projection combining `rateLimitsByLimitId` with the legacy `rateLimits` bucket;
- primary/secondary windows, credits, spend control, and reached reason when provided;
- read-only reset-credit count/details;
- `fetched_at`, `source`, and `freshness`.

`ordinary_usage_allowed` is never derived. Explicit false or a provider reached/spend-control reason is blocked; explicit true with a saturated window may be presented as limited; null without an explicit block stays unknown. Optional upsell payloads are not projected and never gate execution.

Rolling notifications merge only present non-null fields into the cached legacy bucket, publish `source = NOTIFICATION_MERGE`, mark the snapshot refreshing, and schedule a 75 ms debounced authoritative read. One mutex provides single-flight reads and a generation counter collapses notification storms to one refresh.

Freshness values are:

- `FRESH`: successful authoritative read;
- `REFRESHING`: invalidated or notification-merged while the read is pending;
- `STALE`: a previous snapshot exists but the latest optional read failed;
- `UNAVAILABLE`: no successful optional snapshot exists.

Logout and authoritative account identity changes clear allowance and activity caches before optional reads. A failure therefore cannot expose the previous account's snapshot.

Reset credits are display-only. WorkMate has no redeem, consume, nudge-email, or other quota mutation path.

## Diagnostics

`server/diagnostics` is called as a content-free, read-only RPC. The API returns structured checks for runtime version, authentication, allowance read, activity read, and app-server process diagnostics. Each check contains an ID, status, safe summary, and optional remediation.

Diagnostic and optional usage failures create warnings but do not change a valid `SIGNED_IN` state and do not mark the runtime unavailable. Renderer UI is a compact health section in the existing Agent Center repair surface, not a new dashboard.

No raw RPC error, authorization URL, token, header, cookie, credential path, process command line, SQLite row, or JSONL payload is retained in account state, diagnostics, Trace, or Review. Diagnostic responses project only the fact that a content-free process identity was present; raw gauges/process payloads are not forwarded.

Stable error codes in this slice are `RATE_LIMITED`, `QUOTA_UNAVAILABLE`, `USAGE_READ_FAILED`, `RATE_LIMIT_READ_FAILED`, and `DIAGNOSTIC_FAILED`.

## Runtime error integration

Codex structured `usageLimitExceeded` and `rateLimitExceeded`, plus bounded messages matching usage/rate-limit exhaustion, are classified as `RATE_LIMITED`. This class is terminal even if an upstream notification says `willRetry = true`:

```text
error(usage/rate limit)
  -> failed RATE_LIMITED terminal
  -> clear active turn
  -> no automatic retry, restart, or replay
  -> trailing turn/completed is absorbed by terminal precedence
```

The existing TaskRun terminal path persists the failed result and redacted error summary. A later generic completion cannot turn it into success.

## Tests

Core fixtures cover:

- legacy plus multi-bucket projection and stable ordering;
- `ordinaryUsageAllowed` true/false/null without recovery inference;
- safe ignoring of upsell/unknown fields;
- sparse notification merge, null preservation, freshness/source, notification storms, debounce, and bounded RPC count;
- account identity cache invalidation and optional read failure;
- account activity projection and provider-owned daily dates;
- exact runtime `total` versus `last`, replace semantics, and nullable context window;
- stale/unknown Thread ID fencing;
- structured/text rate-limit classification and error-before-completion terminal precedence;
- optional usage/diagnostic failures preserving signed-in runtime availability;
- diagnostic status/remediation projection and credential/error redaction;
- bounded TaskRun usage captured in existing Review.

Renderer fixtures cover multiple buckets, unknown allowance, freshness, account activity, read-only reset credits, diagnostic checks, masked identity, normalized failures, and the existing no-secret authorization handoff.

## Packaged fixture validation

The release gate is:

1. AionCore CI executes the mapping, storm, race, fencing, redaction, and Review fixtures.
2. A Windows x64 AionCore artifact is built from the same tested head.
3. WorkMate PR checks execute type/i18n/unit/build gates.
4. The manual Windows x64 WorkMate build pins that exact AionCore workflow artifact.
5. Packaged install/smoke diagnostics prove the pinned runtime is present, launches, and contains no credential-bearing diagnostic output.

Validation completed on 2026-10-07:

| Gate                     | Evidence                                                                                                                              | Result                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AionCore change          | PR [#139](https://github.com/suoak/AionCore/pull/139), head `0dde25cac276317ef96c370d80f78a8694972c7c24`                              | Stable projections, sparse merge/debounce, thread fencing, terminal precedence, diagnostics, redaction, and bounded Review snapshot implemented |
| AionCore CI              | [run 37599606037](https://github.com/suoak/AionCore/actions/runs/37599606037)                                                         | Format, check, Clippy, workspace nextest, and doctests passed                                                                                   |
| AionCore native contract | [run 37599605991](https://github.com/suoak/AionCore/actions/runs/37599605991)                                                         | Windows, macOS, and Linux presentation-contract jobs passed                                                                                     |
| AionCore Windows x64     | [run 37601041448](https://github.com/suoak/AionCore/actions/runs/37601041448), artifact `aioncore-manual-windows-x64` (`11473710888`) | Passed; this exact run was pinned into WorkMate packaging                                                                                       |
| WorkMate implementation  | PR [#168](https://github.com/suoak/AionUi/pull/168), implementation/package head `e585bfad68cedf80a0961b22699924e1d1347fce`           | Stable TypeScript contract, lightweight Agent Center health UI, all-locale copy, renderer fixtures, and this contract implemented               |
| WorkMate quality         | [run 37599231216](https://github.com/suoak/AionUi/actions/runs/37599231216)                                                           | Lint, format, typecheck, i18n, and 5,519 tests passed; 9 skipped                                                                                |
| Pinned Windows package   | [run 37606217756](https://github.com/suoak/AionUi/actions/runs/37606217756), artifact `windows-build-x64-e585bfa` (`11475358034`)     | Build passed with Core run `37601041448`                                                                                                        |
| Fresh-install smoke      | same package run, artifact `windows-installer-diagnostics-x64-fresh-e585bfa` (`11475562529`)                                          | Fresh installation passed; downloaded diagnostics contained the success status and no token/header/credential-pattern match                     |

The Core fixtures prove mappings, multiple buckets, tri-state allowance, sparse notification behavior and bounded rereads, account invalidation, account activity, exact `total`/`last` thread usage, stale-thread fencing, rate-limit error precedence, structured diagnostics, redaction, and bounded TaskRun/Review persistence. The pinned packaged artifact proves that exact tested Core runtime is present and launchable in WorkMate. These deterministic fixtures do not replace real-account acceptance.

## Deferred acceptance and exclusions

Real-account acceptance must later verify signed-in allowance/activity reads, a live thread usage notification, a real exhausted-limit terminal, restart/resume fencing, and packaged log/Trace/Review redaction. It remains pending with the other M6 real-environment checks.

M6.4 does not add M7 workflow/router work, cost or billing inference, reset-credit consumption, performance routing, automatic model selection, SIWC, or a CodeBuddy overhaul.
