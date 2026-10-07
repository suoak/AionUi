# M6.1 Codex ChatGPT account and authentication

## Status and scope

```text
M5   = PARTIAL / OPEN
M6   = OPEN
M6.1 = IMPLEMENTED / PACKAGED ACCEPTANCE PENDING
```

M6.1 adds a real Codex-managed ChatGPT account path to AionCore and WorkMate. It does not add a WorkMate-owned OAuth client, a direct Responses provider, multi-account storage, or broad session/model changes. M6.1 can become `CLOSED` only after the signed Windows packaged acceptance described below; source and CI results alone do not close it.

## Verified protocol baseline

Implementation was checked against the exact installed executable before the contract was written:

```text
codex-cli 0.160.1
C:\Users\suchen\.vscode\extensions\openai.chatgpt-26.930.61225-win32-x64\bin\windows-x86_64\codex.exe
```

Machine-generated schema evidence is retained outside the repositories at:

```text
C:\Users\suchen\aion\protocols\samples\codex-cli\0.160.1\schema-full
```

The generated client/server method catalogs confirm `account/read`, `account/login/start`, `account/login/cancel`, `account/logout`, `account/rateLimits/read`, `account/usage/read`, `account/updated`, `account/rateLimits/updated`, and `account/login/completed`. The `chatgpt` login result contains `authUrl` and `loginId`. `chatgptAuthTokens` is explicitly unstable/internal and is not used.

The runtime reports its installed version separately from the verified WorkMate baseline `0.160.1`. A missing account method is `PROTOCOL_UNSUPPORTED`; WorkMate does not fall back to credential files, token injection, or a private backend.

## Ownership and security boundary

```text
WorkMate renderer
  -> typed WorkMate account API
  -> CodexAccountService
  -> managed `codex app-server --stdio`
  -> official account RPC
  -> system browser for the one-time HTTPS authorization URL
```

Codex owns credential storage and refresh. WorkMate never reads `auth.json`, never requests or persists access/refresh/ID tokens, never uses `chatgptAuthTokens`, and never calls a private ChatGPT/Codex backend. The account process is created by the existing managed process supervisor and remains owned for the full RPC client lifetime.

The authorization URL exists only in the login-start response and the renderer's current call frame. The UI accepts only `https:` before asking the operating system to open it. The full URL is not logged, persisted, broadcast, placed in Trace/Review, or copied into account state. Error redaction covers bearer values, authorization headers, OAuth token parameters, authorization codes, and full authorization URLs.

## Account contract

The stable projection contains:

- authentication state: `UNKNOWN`, `SIGNED_OUT`, `AUTHENTICATING`, `SIGNED_IN`, or `ERROR`;
- nullable account type, auth mode, masked-display email, plan type, and experimental workspace routing;
- the current login attempt keyed by `loginId`;
- monotonically increasing account identity generation;
- nullable official rate-limit and account-usage snapshots;
- optional-data warnings;
- installed and verified Codex versions.

Workspace routing is diagnostic only and is not a sign-in gate. Rate limits and account usage are optional: failures add warnings without changing a valid `SIGNED_IN` state. `account/read` is authoritative and required.

The backend routes are:

| Method | Route                                    | Meaning                                                                |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| `GET`  | `/api/agents/codex/account`              | Current projection; performs the first authoritative read when unknown |
| `POST` | `/api/agents/codex/account/refresh`      | Explicit authoritative refresh                                         |
| `POST` | `/api/agents/codex/account/login`        | Starts exactly `account/login/start {"type":"chatgpt"}`                |
| `POST` | `/api/agents/codex/account/login/cancel` | Cancels the active `loginId`, then rereads                             |
| `POST` | `/api/agents/codex/account/logout`       | Calls official logout, clears local limits/usage, then rereads         |

## State and race rules

Startup initializes a dedicated account app-server and proactively calls `account/read`. Failure does not prevent WorkMate from starting and does not redefine runtime installation as authentication.

Only one login attempt may be active. A completion notification is accepted only when its `loginId` matches the active attempt; stale completion from an older attempt is ignored. `account/updated`, a matching `account/login/completed`, and `account/rateLimits/updated` are invalidations, not snapshots. They schedule a 75 ms debounced refresh, and all refreshes pass through one single-flight gate before publishing `codex.accountUpdated`.

Logout and account identity changes are fail closed. Account type plus email is the narrowest stable identity currently exposed by the verified public response. After the first authoritative read, a change of that identity increments the generation and recycles only active `codex` tasks with `AccountChanged`; conversation history and resume anchors remain stored, but no active process or turn is automatically replayed. The next user turn must create a process under the new identity.

## WorkMate UI

Agent Settings shows a Codex account card independent of the agent availability banner. It provides:

- signed-out, authenticating, signed-in, error, and unknown states;
- managed browser login with duplicate-start prevention;
- explicit cancel, logout, and refresh actions;
- masked email and plan display;
- official primary/secondary used percentages and lifetime token usage when returned;
- a non-fatal warning when optional limit/usage reads are unavailable.

All text is present in the 13 supported locales. Raw backend failures are not rendered to the user.

## Automated evidence

AionCore tests cover the state projection, login ID correlation, stale completion, cancellation, logout plus reread, notification invalidation, optional-data degradation, required-read failure, redaction, workspace-routing neutrality, identity generation, and backend-specific task recycling. The app crate compilation validates production wiring.

WorkMate tests cover signed-out login, one-time browser launch, non-HTTPS rejection, authenticating duplicate prevention, signed-in masked identity/plan/limits/usage, logout visibility, and normalized action failure. The i18n consistency check and TypeScript compiler are required gates.

Formal acceptance is the GitHub CI result for the Core and WorkMate branches/PRs. Local validation is supporting evidence only.

## Windows packaged acceptance

The final signed smoke must use a Windows packaged WorkMate and the resolved Codex executable, with no credential-file inspection:

1. start signed out and confirm the account card remains separate from runtime availability;
2. start managed browser login, verify duplicate prevention, cancel once, then start again;
3. complete real ChatGPT authorization and confirm `SIGNED_IN`, masked identity, plan, and any provider-returned limits/usage;
4. start a fresh Codex conversation and obtain the exact live response `WORKMATE_CODEX_AUTH_OK`;
5. restart packaged WorkMate, confirm authoritative account restoration, and perform a new live turn without automatic replay;
6. log out, confirm authoritative `SIGNED_OUT`, cleared limit/usage snapshots, preserved history, and a new-turn authentication requirement;
7. inspect packaged logs, diagnostics, Trace, Review, browser history handoff, and support artifacts for token, code, header, credential-path, and authorization-URL leakage;
8. record package version, Core revision, WorkMate revision, Codex version, Windows version, tester, UTC timestamp, and signed result.

OAuth completion cannot be declared by an unattended test. If interaction is unavailable, the packaged build may pass CI but M6.1 stays `IMPLEMENTED / PACKAGED ACCEPTANCE PENDING`.

## Closure rule

M6.1 closes only when both repository CI gates pass and the real packaged login/live-inference/restart/logout smoke is signed. M6 remains open for the broader Codex session, restart, error, rate-limit, and release evidence defined by the M6 baseline.
