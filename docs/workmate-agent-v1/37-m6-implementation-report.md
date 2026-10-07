# M6 Codex and ChatGPT Integration Report

## Status

```text
IMPLEMENTATION = COMPLETE
STABLE AIONCORE RELEASE = INTEGRATED
FINAL WINDOWS X64 CANDIDATE = BUILT AND PACKAGED-SMOKE VERIFIED
REAL CHATGPT ACCOUNT ACCEPTANCE = PENDING

M6 = OPEN
M7 = NOT STARTED
```

This is the implementation report for M6. It is not the closure declaration. The immutable candidate and pending real-account gates are recorded in [36-m6-packaged-validation.md](./36-m6-packaged-validation.md).

## Objective and prioritization

M6 establishes OpenAI Codex as WorkMate's first production-oriented external agent runtime backed by a user's ChatGPT account. It was prioritized because the Codex app-server exposes structured account, thread, turn, model, usage, rate-limit, and diagnostic contracts while retaining ownership of ChatGPT credentials.

Aion remains the `GUARANTEED` strict-planning reference runtime. Claude Code and CodeBuddy remain compatibility runtimes in this milestone; M6 verifies their existing send/stream/complete paths but does not redesign them. M5 remains `PARTIAL / OPEN`; blocked real KnowHub work is not mixed into the M6 candidate.

## Architecture

The production path is:

```text
WorkMate renderer
  -> typed IPC / main-process services
  -> AionCore account and session APIs
  -> dedicated Codex session backend
  -> Codex app-server JSON-RPC
  -> Codex-managed ChatGPT account and native threads
```

The renderer displays stable WorkMate projections and never owns the Codex process, raw JSON-RPC connection, browser callback, or credentials. AionCore owns process supervision, lifecycle serialization, protocol mapping, thread binding, terminal precedence, and reduced Trace/Review evidence. Detailed baselines are in [29-m6-codex-baseline.md](./29-m6-codex-baseline.md) and [30-codex-app-server-evaluation.md](./30-codex-app-server-evaluation.md).

## Credential ownership and authentication

The default mode is Codex-managed ChatGPT login:

```text
account/login/start { type: "chatgpt" }
  -> WorkMate opens the returned authorization URL
  -> Codex owns callback, credential storage, and refresh
  -> account/login/completed
  -> account/read confirms the authoritative state
```

WorkMate does not request, parse, store, refresh, log, or persist access, refresh, or ID tokens. It does not inspect Codex credential files, inject `chatgptAuthTokens`, or call a private ChatGPT backend. Logout is an app-server operation followed by an authoritative account reread and cache invalidation. The stable state/race rules and safe account projection are defined in [32-codex-auth-account.md](./32-codex-auth-account.md).

## Session and thread binding

Codex sessions map directly to native protocol operations:

- fresh session -> `thread/start`;
- resumed session -> `thread/resume {threadId}`;
- user turn -> `turn/start`;
- cancellation -> `turn/interrupt`.

The authoritative Thread ID is persisted in the task's runtime binding. WorkMate does not replay renderer conversation history and call it a resume. Missing, rejected, or poisoned anchors fail closed or require an explicit new-session recovery. Runtime generation and Thread ID fencing prevent late events from an old process/thread mutating the active task. Exact lifecycle and persistence rules are documented in [33-codex-session-runtime.md](./33-codex-session-runtime.md).

## Dynamic model catalog and reasoning selection

The Codex model catalog is discovered through paginated `model/list`; WorkMate does not hardcode permanent GPT model names. The stable projection preserves visibility, default/upgrade metadata, supported reasoning efforts, catalog freshness, and provider order. Auto remains distinct from an explicit model request.

Selection is applied at a safe turn boundary. Unsupported effort values fail validation instead of being silently coerced. Requested model/effort are persisted as preferences, while selected/effective values are runtime evidence. Resume reconciles the authoritative model returned by `thread/resume`. See [34-codex-model-discovery.md](./34-codex-model-discovery.md).

## Usage, rate limits, and diagnostics

M6 keeps three domains separate:

1. account allowance from `account/rateLimits/read`;
2. provider-reported account activity from `account/usage/read`;
3. active-thread counters from `thread/tokenUsage/updated`.

Rate-limit projections support multiple buckets, preserve `ordinaryUsageAllowed` as true/false/null, and use conservative availability. Sparse rolling notifications merge only present fields, mark freshness/source, and trigger a debounced single-flight authoritative reread. Account identity changes and logout invalidate cached account/model/limit/usage state.

Thread `total` and `last` counters remain separate and use replace semantics. Stale Thread IDs are fenced. `RATE_LIMITED` is terminal even when followed by an upstream completion and never triggers automatic replay. Diagnostics are read-only structured `PASS`, `WARN`, `FAIL`, or `NOT_APPLICABLE` checks. Optional usage/diagnostic failures do not invalidate a working authenticated runtime. See [35-codex-usage-diagnostics.md](./35-codex-usage-diagnostics.md).

## Trace and Review integration

M6 reuses the M4 execution-evidence model rather than introducing a Codex-only history store. Reduced runtime evidence includes the runtime type, persisted Thread/Turn identity, requested and effective model/reasoning values, and the latest bounded token-usage snapshot at the existing TaskRun boundary.

Trace and Review do not retain raw provider payloads, prompts, authorization URLs, headers, cookies, tokens, credential paths, process command lines, or high-frequency usage notifications. A later generic completion cannot overwrite an earlier terminal rate-limit failure.

## Release and packaged validation

AionCore M6.1–M6.4 is released as [`v0.2.16`](https://github.com/suoak/AionCore/releases/tag/v0.2.16) from commit `1c59adf182775fb3a39addad2a37f4e2768e81d5`. The official release workflow built six platform archives; every archive digest matched `aioncore-checksums.txt`.

WorkMate main `34f83ef7737079a6a3d607a5a3135ae71f85b14d` pins that stable release. The frozen Windows x64 candidate is `CSBU-WorkMate-2.3.0-win-x64.exe` with SHA-256 `2d6daaa1660b8415b9d82725f38550f9541e9f4d80331efa2f59f50e4b3ab3b2`. Its production build, packaged strict-planning gate, and fresh-install smoke passed. Full immutable identity and run links are in document 36.

## Security properties

- Codex, not WorkMate, owns ChatGPT credentials in the M6 default mode.
- Account and diagnostic APIs expose reduced stable DTOs rather than raw provider payloads.
- Model, account, usage, and rate-limit caches are invalidated across authoritative identity/logout boundaries.
- Runtime/thread generation fencing rejects stale events.
- Resume uses a persisted native Thread ID and does not substitute transcript replay.
- Release and WorkMate download checksum mismatches fail closed.
- Fixture, package, and installer diagnostics scans found no credential-bearing fields.

The final real-account run must repeat the security scan across actual logs, diagnostics, Trace, Review, and persisted state before closure.

## Known limitations

- Codex `PlanningIsolation` remains `BEST_EFFORT`. M6 does not claim the complete mutation-boundary proof required to upgrade it to `GUARANTEED`.
- Aion Agent remains the `GUARANTEED` reference runtime.
- Provider-optional account usage may legitimately be unavailable and must remain `UNAVAILABLE`/`WARN`, not fabricated.
- Model names and reasoning options are runtime-advertised and may change; no specific GPT model is a permanent product guarantee.
- Deliberately exhausting a real ChatGPT quota is not an acceptance requirement; the terminal race is fixture-covered.
- Real OAuth, live inference, native semantic resume, real usage/limits, logout invalidation, and post-logout execution remain pending on the frozen candidate.

## Deferred SIWC

Sign in with ChatGPT for direct/public Responses access remains deferred. It would make WorkMate the OAuth credential owner and expand storage, refresh, revocation, multi-account, and distribution-security responsibilities. M6 therefore uses the better-contained Codex-managed login and does not implement SIWC credential tables, OAuth IPC, or a direct Responses provider. See [31-sign-in-with-chatgpt-evaluation.md](./31-sign-in-with-chatgpt-evaluation.md).

## Compatibility and scope boundaries

M6 does not add a CodeBuddy SDK, impose Codex strict-planning claims on Claude, implement workflow routing, or create automatic runtime selection. Existing non-Codex providers remain on their established paths and are covered by the repository regression gates.

## M7 readiness

The implementation, stable Core release, WorkMate pin, and final packaged candidate establish the technical prerequisite for M7. M7 remains `NOT STARTED` and is not authorized until:

```text
M6.1 = CLOSED
M6.2 = CLOSED
M6.3 = CLOSED
M6.4 = CLOSED
M6 = CLOSED
```

Those status changes require the one joint real-account acceptance in document 36. Until then, the accurate conclusion is:

```text
Codex / ChatGPT Integration = RELEASE-INTEGRATED CANDIDATE
PRODUCTION BASELINE ESTABLISHED = PENDING REAL ACCOUNT ACCEPTANCE
```
