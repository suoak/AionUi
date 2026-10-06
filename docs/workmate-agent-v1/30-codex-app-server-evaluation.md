# Codex app-server evaluation

## Decision

The current official Codex app-server protocol has a usable, structured, Codex-managed ChatGPT account flow. WorkMate should adopt that flow as the M6 production default:

```text
WorkMate UI
  -> WorkMate account API
  -> authoritative AionCore Codex process owner
  -> account/login/start { type: "chatgpt" }
  -> user opens returned authUrl
  -> Codex stores and refreshes its managed credentials
  -> account/login/completed + account/updated
  -> account/read
```

This path satisfies the M6 security boundary: WorkMate does not read `~/.codex/auth.json`, receive OAuth tokens, call private Codex backend endpoints, or implement a private OAuth client.

The official protocol also supports device-code login, status reads, cancellation, logout, account plan projection, rate-limit snapshots, account usage, model discovery, thread lifecycle, and turn lifecycle. Availability in the protocol does not prove that the Codex executable shipped with WorkMate supports the method or that a particular account/backend returns every optional field. M6 must version-probe and package-test the exact binary.

## Evaluation basis

This evaluation was performed on 2026-10-07 against:

- official `openai/codex` commit [`404cd42aa5254af56a6080af1a775f730ac6b7d0`](https://github.com/openai/codex/commit/404cd42aa5254af56a6080af1a775f730ac6b7d0), dated 2026-10-06;
- the v2 account protocol in [`account.rs`](https://github.com/openai/codex/blob/404cd42aa5254af56a6080af1a775f730ac6b7d0/codex-rs/app-server-protocol/src/protocol/v2/account.rs);
- method registration in [`common.rs`](https://github.com/openai/codex/blob/404cd42aa5254af56a6080af1a775f730ac6b7d0/codex-rs/app-server-protocol/src/protocol/common.rs);
- the official [Sign in with ChatGPT overview](https://developers.openai.com/siwc/token-sharing-open-source), [Codex app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), and [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

The source commit is pinned so later protocol drift does not silently rewrite this decision.

## Classification vocabulary

| Verdict         | Meaning                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `AVAILABLE`     | Present and usable in the current official protocol, but stability or backend availability is not fully established |
| `STABLE`        | Present in the exported v2 protocol without an experimental marker                                                  |
| `EXPERIMENTAL`  | Explicitly gated or marked experimental in the official protocol                                                    |
| `INTERNAL_ONLY` | Explicitly unstable/internal or unsafe for the WorkMate production boundary                                         |
| `NOT_NEEDED`    | Real capability that WorkMate should not adopt for the M6 product path                                              |

`STABLE` is a protocol-source classification, not a minimum-version claim. The installed runtime must still prove support during capability probing.

## Account and authentication matrix

| Capability                    | Official method/event                                             | Verdict         | WorkMate decision                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| browser ChatGPT login         | `account/login/start`, `{type: "chatgpt"}`                        | `STABLE`        | **Use as the primary M6 login.** The response contains `loginId` and `authUrl`; WorkMate opens the URL but never receives credentials.                 |
| device-code ChatGPT login     | `account/login/start`, `{type: "chatgptDeviceCode"}`              | `STABLE`        | Supported fallback where browser loopback is unsuitable. Show `verificationUrl` and `userCode`; do not guess completion.                               |
| cancel login                  | `account/login/cancel`                                            | `STABLE`        | Use with the active `loginId`. Treat `canceled` and `notFound` as distinct terminal outcomes.                                                          |
| login completion              | `account/login/completed`                                         | `STABLE`        | Authoritative terminal notification for an attempt. Correlate by `loginId`; surface sanitized error text.                                              |
| account changed               | `account/updated`                                                 | `STABLE`        | Treat as invalidation/snapshot signal, then reread `account/read`; do not treat a queued notification as authorization.                                |
| account status                | `account/read`                                                    | `STABLE`        | Use for signed-in state, auth requirement, account type, email where present, and ChatGPT plan type.                                                   |
| proactive managed refresh     | `account/read`, `{refreshToken: true}`                            | `STABLE`        | Optional diagnostic/revalidation operation. In managed mode Codex runs its refresh flow; WorkMate receives no token.                                   |
| logout                        | `account/logout`                                                  | `STABLE`        | Use for formal logout. Do not delete Codex credential files. Reread account state and require signed-out confirmation.                                 |
| API-key login                 | `account/login/start`, `{type: "apiKey"}`                         | `STABLE`        | `NOT_NEEDED` for the M6 ChatGPT-first UX. It may remain a separate advanced runtime path, with secret-handling requirements outside this account flow. |
| external token injection      | `account/login/start`, `{type: "chatgptAuthTokens"}`              | `INTERNAL_ONLY` | Explicitly marked unstable and for OpenAI internal use only. Prohibited as the WorkMate production solution.                                           |
| external token refresh        | reverse RPC `account/chatgptAuthTokens/refresh`                   | `INTERNAL_ONLY` | Belongs to external-auth mode. Do not expose it through renderer IPC, persistence, Trace, Review, or diagnostics.                                      |
| workspace routing details     | `account/read.workspaceRouting`                                   | `EXPERIMENTAL`  | Not required for M6 UI. WorkMate must not call private routing endpoints or infer unrestricted access when this field is absent.                       |
| gateway/enterprise auth paths | `account/gatewayOAuth/*` and enterprise-specific protocol support | `STABLE`        | `NOT_NEEDED` for M6 P0. Project only when the configured runtime reports the corresponding provider requirements and structured readiness.             |

## Managed login behavior

For browser login, the app-server starts its own login server with `open_browser = false` and returns the authorization URL to the client. This separation is suitable for WorkMate:

1. AionCore sends `account/login/start` with `type = chatgpt`.
2. The response binds an opaque `loginId` to an `authUrl`.
3. WorkMate opens the URL through the trusted desktop shell boundary.
4. Codex completes the OAuth flow and stores credentials according to its configured credential-store mode.
5. App-server emits `account/login/completed` with success or a sanitized failure.
6. App-server emits `account/updated` after account state changes.
7. AionCore calls `account/read` and projects the result into `AuthenticationState`.

Starting a new login supersedes the active browser/device attempt in the current implementation. WorkMate should still prevent duplicate clicks and send explicit cancellation so its UI state does not depend on replacement timing.

The default M6 request should omit optional branding and streamlined-login flags until packaged compatibility proves their semantics. Only `type = chatgpt` is required for the first production slice.

## AuthenticationState projection

The protocol does not return WorkMate's desired enum directly. The adapter should project it without reading credential storage:

| WorkMate state   | Evidence                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `UNKNOWN`        | app-server has not initialized, `account/read` has not completed, or the method is unavailable                                  |
| `SIGNED_OUT`     | `account/read.account = null` while `requiresOpenaiAuth = true`, with no active login                                           |
| `AUTHENTICATING` | a successful `account/login/start` response produced an active `loginId` and no terminal completion has arrived                 |
| `SIGNED_IN`      | `account/read.account.type = chatgpt`                                                                                           |
| `EXPIRED`        | managed refresh or an authenticated operation returns a structured auth-expiry/unauthorized result that cannot be refreshed     |
| `ERROR`          | login completion failed, account read failed, or account state is internally inconsistent; retain only redacted diagnostic data |

`account/updated` is not by itself proof of `SIGNED_IN`. It contains nullable `authMode` and `planType`; the adapter must reread `account/read` before publishing the authoritative state.

For API-key or non-OpenAI configurations, `requiresOpenaiAuth` and the account union must be interpreted together. The UI must not translate every `account = null` result into "ChatGPT login required."

## Account information

`account/read` can return:

```text
account = null
account.type = apiKey
account.type = chatgpt { email?, planType }
account.type = amazonBedrock { usesCodexManagedCredentials }
requiresOpenaiAuth = boolean
workspaceRouting? = experimental
```

M6 may safely project the account type/auth mode, nullable email, and plan type. The provider remains OpenAI Codex. Email is display data, not a durable identity key, and must not be used to join WorkMate users or KnowHub subjects.

Unknown plan values must remain unknown. The UI must not infer Plus, Pro, Business, Enterprise, Edu, or workspace membership from rate limits, model availability, or email domain.

## Usage and rate limits

| Capability                | Official method/event              | Verdict  | Semantics                                                                                                                                                     |
| ------------------------- | ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| account rate-limit read   | `account/rateLimits/read`          | `STABLE` | Returns nullable backend permission, primary/secondary windows, used percentage, reset time, credits, plan, reached reason, and optional per-limit snapshots. |
| rolling rate-limit update | `account/rateLimits/updated`       | `STABLE` | Sparse update. Merge into the latest read or refetch; missing nullable metadata does not clear the previous snapshot.                                         |
| account usage read        | `account/usage/read`               | `STABLE` | Returns nullable lifetime/peak/streak statistics, optional daily token buckets, and optional estimated thread usage. Backend/account availability may vary.   |
| thread token telemetry    | `thread/tokenUsage/updated`        | `STABLE` | Existing WorkMate integration consumes this for current-thread usage/context occupancy. It is separate from account usage and rate-limit allowance.           |
| reset-credit consumption  | `account/rateLimitResetCredit/...` | `STABLE` | `NOT_NEEDED` for M6. It mutates account allowance and requires dedicated product, confirmation, and idempotency design.                                       |
| add-credit nudge email    | `account/sendAddCreditsNudgeEmail` | `STABLE` | `NOT_NEEDED` for M6. It causes an external side effect and is outside runtime diagnostics.                                                                    |

WorkMate should expose provider-reported values exactly and keep every optional field nullable. In particular:

- `usedPercent` is not a currency cost;
- a missing reset time is unknown, not zero;
- `ordinaryUsageAllowed = null` is unknown, not allowed;
- a model catalog is not an entitlement check;
- current-thread token usage is not the same as ChatGPT plan allowance;
- missing account usage must not be replaced with prompt-length estimates.

The first M6 UI can show rate-limit windows and reset times where returned. Account usage history is P1 because its fields describe activity statistics rather than a simple remaining quota.

## Session and model protocol

The official protocol confirms the existing WorkMate direction:

| Area             | Method/event                                       | Verdict     | WorkMate state                                                                                     |
| ---------------- | -------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| initialize       | `initialize`, then `initialized`                   | `STABLE`    | Implemented                                                                                        |
| model catalog    | `model/list`                                       | `STABLE`    | Implemented; treat as a catalog, not an account entitlement guarantee                              |
| create           | `thread/start`                                     | `STABLE`    | Implemented                                                                                        |
| resume           | `thread/resume`                                    | `STABLE`    | Implemented at source level; packaged restart proof still required                                 |
| fork             | `thread/fork`                                      | `STABLE`    | Implemented                                                                                        |
| send             | `turn/start`                                       | `STABLE`    | Implemented                                                                                        |
| stream           | item/turn notifications                            | `STABLE`    | Implemented                                                                                        |
| complete         | `turn/completed`                                   | `STABLE`    | Must inspect turn status; only `completed` is success                                              |
| cancel           | `turn/interrupt`                                   | `STABLE`    | Implemented as whole-turn cancellation                                                             |
| local continuity | saved thread ID plus `thread/resume`               | `STABLE`    | Existing persisted resume anchor is appropriate                                                    |
| SIWC continuity  | restart app-server with renewed token, then resume | `AVAILABLE` | Applies only to the separate host-managed SIWC mode; not to the preferred Codex-managed login path |

The current WorkMate adapter should add account requests and notifications to its existing JSON-RPC reader rather than create a parallel process or terminal parser.

## Native managed auth versus Sign in with ChatGPT

Two official paths now exist and must not be conflated:

| Path                              | Credential owner            | Login surface                                                                  | M6 role                                                                                              |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Codex-managed ChatGPT login       | Codex credential store      | app-server `account/login/start {type: chatgpt}`                               | **Production default candidate**; matches the security boundary                                      |
| Sign in with ChatGPT for OSS apps | the integrating application | SIWC OAuth plus token storage/refresh, then app-server receives `ACCESS_TOKEN` | Separate evaluation in document 31; official but preview-limited and changes WorkMate's threat model |
| external `chatgptAuthTokens` mode | external client             | unstable app-server token-injection variant                                    | `INTERNAL_ONLY`; never the production shortcut                                                       |

Official SIWC documentation explicitly requires the application to store and refresh credentials and to restart app-server with a renewed token. It is therefore not a drop-in implementation of the "WorkMate never handles OAuth credentials" requirement. Its official status does not make the internal `chatgptAuthTokens` variant safe or stable.

## Version and compatibility strategy

No hard minimum Codex version is established by this source audit. M6 should use an evidence-driven compatibility probe:

1. resolve the exact executable and record `codex --version`;
2. start app-server and complete `initialize`;
3. call `account/read`;
4. classify JSON-RPC `-32601` as account protocol unavailable, not signed out;
5. enable browser login only when `account/read` and `account/login/start` are supported by the tested runtime line;
6. keep session-only operation available when policy permits and account management is unavailable;
7. persist only the capability verdict and sanitized diagnostics, never protocol credentials or raw auth payloads.

The WorkMate release must pin or constrain the Codex binary version it packages/resolves. A moving PATH executable cannot support a durable `STABLE` product claim without a runtime probe and clear remediation.

## Error mapping

| Protocol/runtime result                                   | WorkMate error/state                              |
| --------------------------------------------------------- | ------------------------------------------------- |
| executable not resolved                                   | `NOT_INSTALLED`                                   |
| app-server start/initialize failure                       | `START_FAILED` or `PROTOCOL_ERROR`                |
| `account/read` method not found                           | account capability `UNAVAILABLE`; auth `UNKNOWN`  |
| `account/read.account = null` and auth required           | `SIGNED_OUT` / `NOT_AUTHENTICATED`                |
| login start returns `loginId`                             | `AUTHENTICATING`                                  |
| login completion `success = false`                        | `ERROR` with sanitized reason                     |
| managed refresh cannot recover an unauthorized credential | `EXPIRED` / `AUTH_EXPIRED`                        |
| rate-limit reached reason or structured 429               | `RATE_LIMITED`, preserving provider reset details |
| app-server exits during an active operation               | `RUNTIME_CRASHED`                                 |
| user interrupts or cancels login                          | `CANCELLED`                                       |

Raw OAuth URLs can contain sensitive state and must not enter persistent logs, Trace, Review, analytics, or support bundles. The UI may receive the current one-time authorization URL only through a bounded launch operation.

## M6 implementation recommendation

Implement the following P0 slice behind the existing authoritative Codex process layer:

```text
account/read
account/login/start { type: chatgpt }
account/login/cancel
account/login/completed
account/updated
account/logout
account/rateLimits/read
account/rateLimits/updated
```

Retain existing structured session, model, tool, approval, usage, and resume handling. Add `account/usage/read` after the account/rate-limit contract is stable in WorkMate. Defer multi-account sessions, workspace routing, credit mutation, email nudges, and all external token injection.

The final production choice remains conditional on packaged validation of the resolved Codex version. The protocol evaluation itself yields:

```text
Codex managed browser login = STABLE in current official v2 source
Codex managed device login  = STABLE in current official v2 source
account read/logout          = STABLE in current official v2 source
rate limits/account usage    = STABLE protocol, backend-dependent values
external ChatgptAuthTokens   = INTERNAL_ONLY
workspace routing details    = EXPERIMENTAL
```

M6 remains open until WorkMate implements this contract and passes the packaged Windows scenarios.
