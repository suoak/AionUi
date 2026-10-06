# Sign in with ChatGPT evaluation

## Decision

Sign in with ChatGPT (SIWC) is now an official path for open-source and locally hosted applications to request permission to use a user's ChatGPT plan for eligible public Responses API requests. WorkMate is Apache-2.0 licensed and packaged as a local Electron application, so its current distribution model appears eligible for the documented open-source flow.

SIWC is **not** the M6 production login path.

```text
M6 Codex default
  = Codex-managed account/login/start

SIWC direct/provider path
  = AVAILABLE / PREVIEW / NOT SELECTED
```

The reason is architectural, not a lack of official support. SIWC requires the integrating application to receive, validate, persist, refresh, revoke, and supply OAuth credentials. That expands WorkMate's security boundary and directly conflicts with the M6 requirement that Codex own credential storage and refresh. The current Codex app-server already exposes a structured managed-login flow that better fits M6.

SIWC remains strategically useful as a future experimental `OpenAIAccountProvider` for direct Responses access or for a deliberately host-managed app-server mode. It must not be implemented by copying Codex OAuth identifiers, private endpoints, or the app-server's internal `chatgptAuthTokens` variant.

## Evaluation basis

This evaluation was performed on 2026-10-07 using current official OpenAI documentation:

- [ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Codex app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)
- [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines)

The official documentation describes the capability as optional ChatGPT plan usage for open-source and locally hosted apps. Paid or remotely hosted products are directed to an interest process. WorkMate must reassess eligibility before offering SIWC in a distribution or hosting model that differs from the audited local open-source application.

## Eligibility and registration

| Question                                         | Current official answer                                                                                                                                                     | WorkMate verdict                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Is an open-source client supported?              | Yes. The documented ChatGPT plan usage flow targets open-source and locally hosted apps.                                                                                    | `AVAILABLE` for the current Apache-2.0 local desktop distribution, subject to policy/legal confirmation |
| Is partner approval required for OSS?            | The documented dynamic-registration flow needs neither a client secret nor a partner API key.                                                                               | No partner credential is required for this OSS flow                                                     |
| Is a pre-issued static client ID required?       | No for first registration. Start with `client_id=dynamic_agent_client`; the callback returns a user/workspace-bound issued client ID that must be saved for later sign-ins. | WorkMate must not copy Codex's client ID                                                                |
| Is a client secret required?                     | No for this direct open-source flow.                                                                                                                                        | Do not create or embed one                                                                              |
| Is a stable host identity required?              | Yes. Each host needs a persisted opaque `ext_agent_host_id`; the same host reuses it across sign-ins.                                                                       | New durable non-personal host identifier would be required                                              |
| Does the user grant plan usage?                  | Yes. The client requests and validates the relevant granted scopes/claims; plan usage does not grant ChatGPT conversations or general account context.                      | Consent must be explicit and narrowly represented                                                       |
| Are paid/remote offerings automatically covered? | No. Official guidance directs paid or remotely hosted apps to an interest process.                                                                                          | Re-evaluate before commercial or hosted rollout                                                         |

WorkMate's repository license and local packaging make it a plausible OSS client; they are not a substitute for confirming that the actual published product, operator, branding, data handling, and distribution comply with the current program terms.

## Official SIWC flow

The host-managed flow is:

```text
WorkMate main/backend process
  -> choose/persist ext_agent_host_id
  -> create state + nonce + PKCE verifier
  -> open system browser authorization
  -> receive loopback callback
  -> validate state and exchange authorization code
  -> validate ID token, identity, audience, nonce, and granted scopes
  -> persist issued client_id + account profile + OAuth credentials
  -> call public https://api.openai.com/v1
```

For first registration, the request uses `dynamic_agent_client`, the host identifier, and a consistent `agent_name_hint`. The returned issued client ID belongs to that account/workspace registration and must be reused for later sign-ins. `dynamic_agent_client` is not the client ID for token exchange or persistence.

Every authorization attempt needs fresh `state`, OIDC `nonce`, and PKCE material. A new account attempt must remain separate from the active account until token and identity validation finish. Email is display information, not the profile's durable identity key.

## Credential ownership and security impact

Unlike the preferred Codex-managed app-server login, SIWC makes WorkMate the credential owner. The documented token response includes:

```text
access_token
refresh_token
id_token
token_type
expires_in
scope
earliest_refresh_at
```

Current documentation specifies one-hour access tokens and rotating refresh tokens with a fresh validity window after successful refresh. WorkMate would have to:

- keep tokens in protected local runtime storage owned by the authoritative backend process;
- keep tokens out of renderer state, browser storage, source control, logs, analytics, Trace, Review, crash reports, and support bundles;
- serialize refreshes per profile so concurrent processes do not race token rotation;
- atomically replace the access and refresh token set after refresh;
- validate ID-token identity and permissions before activating or replacing a profile;
- revoke the renewable session during logout, then clear local tokens;
- report when local logout completed but remote revocation could not be confirmed;
- preserve the issued client/account mapping and host ID for later reauthorization without retaining active credentials;
- redact authorization URLs containing `id_token_hint`.

This is a material new secret-management subsystem. Implementing it merely to feed Codex app-server would duplicate responsibility already handled by Codex-managed login and would increase M6 risk without adding a required user capability.

## App-server use under SIWC

SIWC can be used with Codex app-server, but this is a host-managed mode:

1. WorkMate completes SIWC and obtains the access token.
2. WorkMate passes the token to the app-server child process through a dedicated environment key.
3. App-server is configured with the public `https://api.openai.com/v1` Responses provider.
4. WorkMate drives initialize, thread, turn, and event RPCs over stdio.
5. WorkMate refreshes the OAuth token when needed.
6. WorkMate restarts app-server with the renewed token and resumes the saved thread.

This documented configuration does not use a private ChatGPT backend. It also does not make Codex the credential owner. Therefore it belongs to a separate runtime mode such as:

```text
integration = APP_SERVER
authentication_owner = WORKMATE_SIWC
stability = EXPERIMENTAL
```

It must not be implemented through `account/login/start {type: chatgptAuthTokens}`. The official SIWC app-server configuration uses the public Responses endpoint and an environment-backed provider; the internal token-injection RPC remains an explicitly unstable internal surface.

## Direct Responses provider

SIWC also permits eligible requests directly to the public Responses API. This could support a future provider-neutral design:

```text
OpenAIAccountProvider
  |-- Codex Runtime
  `-- Direct Responses Provider
```

The branches are not equivalent:

| Concern               | Codex Runtime                               | Direct Responses Provider                                 |
| --------------------- | ------------------------------------------- | --------------------------------------------------------- |
| agent harness         | Codex app-server owns the tool/turn harness | WorkMate/Aion must own orchestration and tool execution   |
| session model         | Codex threads and turns                     | Responses streaming under SIWC restrictions               |
| local shell/MCP/tools | Codex runtime capabilities                  | WorkMate/Aion implementation                              |
| resume                | Codex `thread/resume`                       | must be designed from the direct provider's allowed state |
| account credential    | Codex-managed in the M6 default             | WorkMate-managed SIWC credentials                         |
| M6 status             | production target                           | `EXPERIMENTAL`, not a closure requirement                 |

Signing in with ChatGPT does not by itself create a Codex agent runtime. Direct Responses access for Aion must be evaluated and implemented as a distinct provider, with its own session, tool, safety, usage, and packaged evidence.

## Model discovery

For direct SIWC inference, official guidance uses the selected account's access token with public `GET /v1/models`, filters displayable models, and retains server ordering. This is the account-specific catalog for that authenticated profile.

Codex app-server `model/list` may return a bundled or cached client catalog. It is suitable for the Codex runtime selector but is not an entitlement check. A successful inference request proves access to the selected model for that request.

WorkMate must not combine the two catalogs without provenance. A future descriptor needs:

```text
model_catalog_source = CODEX_RUNTIME | SIWC_ACCOUNT | UNKNOWN
```

Model names and availability must remain dynamic; no long-lived list should be hardcoded.

## Usage, plans, and limits

SIWC authorizes eligible use of a ChatGPT plan or credits balance. It does not authorize access to ChatGPT conversations or arbitrary account context.

Official UI guidance requires the application to:

- state when eligible requests use the ChatGPT plan;
- distinguish ChatGPT plan usage from WorkMate subscriptions or charges;
- link users to ChatGPT usage settings to review usage and manage app access/limits;
- present a clear recovery action when a plan/app limit is reached;
- avoid promising a separate allowance when limits are shared across eligible apps.

The documented account/session flow directs usage management to ChatGPT settings. WorkMate must not infer a remaining allowance from token counts or invent prices. If an official response exposes usage or rate-limit information, it must retain provider provenance and nullable fields.

## Preview limitations relevant to WorkMate

The documented ChatGPT plan usage route currently has material restrictions:

- requests use the public Responses API with `store = false` and streaming enabled;
- several ordinary Responses fields and hosted tools are unsupported;
- HTTP continuation cannot rely on persistent `previous_response_id`; required history must be supplied in input;
- app-server uses its RPC inputs and local thread history rather than arbitrary Responses parameters;
- local shell, MCP, and child-agent behavior belongs to Codex, not hosted Responses tools;
- token renewal is the application's responsibility in SIWC mode;
- restarting app-server with the renewed token is part of continuity;
- model/tool availability remains subject to account and workspace policy.

These limitations make SIWC a preview integration surface, not a transparent replacement for the existing Codex runtime or Aion provider contracts.

## Multi-account behavior

Official SIWC guidance supports multiple saved account registrations. Each profile needs a distinct issued client ID, credentials, label, identity, and workspace binding even when email addresses match.

This is outside M6 P0. A future implementation would need explicit contracts for:

- profile list and active profile;
- add, reauthorize, switch, revoke, and local removal;
- profile-scoped model catalogs and plan-usage labeling;
- token refresh serialization per profile;
- preventing a client ID from one registration from being combined with tokens from another;
- binding running TaskSessions to the intended account without silently switching identity.

The first Codex-managed M6 UI should expose the single effective Codex account returned by `account/read`, not build SIWC multi-account storage prematurely.

## Product and distribution constraints

Before enabling SIWC, WorkMate would need evidence for:

```text
current distribution qualifies for the OSS/local flow
approved Continue with ChatGPT branding and consent UX
stable per-host identifier lifecycle
loopback callback hardening
PKCE/state/nonce validation
ID-token and scope validation
secure credential storage on Windows/macOS/Linux
refresh rotation and crash consistency
logout/revocation semantics
account isolation
redaction and support diagnostics
packaged update/migration behavior
```

If WorkMate becomes a paid service, remotely hosted runtime, managed enterprise service, or otherwise leaves the documented OSS/local shape, the team must use the current OpenAI participation/registration route instead of assuming the dynamic open-source flow still applies.

## Recommendation

For M6:

```text
Codex managed app-server auth = IMPLEMENT
SIWC credential ownership      = DO NOT IMPLEMENT
Direct Responses provider      = FUTURE EXPERIMENT
Internal ChatgptAuthTokens     = PROHIBITED
```

Keep an architectural seam for a future `OpenAIAccountProvider`, but do not create credential tables, OAuth IPC, or a direct Responses provider during the Codex account slice. Revisit SIWC only when there is an explicit product requirement that Codex-managed login cannot satisfy and the project accepts the expanded credential-security scope.

This evaluation does not change the M6 closure path. M6 remains centered on Codex-managed ChatGPT authentication, structured Codex sessions, provider-reported account state/limits where supported, and packaged Windows validation.
