# M6 Codex integration baseline

## Status

```text
M5 = PARTIAL / OPEN
M6 = OPEN
```

M5 remains open for the real KnowHub provider and packaged evidence, but it does not block the independent M6 Codex work.

M6 is now centered on OpenAI Codex and ChatGPT account integration. Claude Code and CodeBuddy are maintenance runtimes only. Aion remains the `GUARANTEED` reference runtime and is not subject to a broad redesign in this milestone.

This baseline records the repository state before M6 implementation. It does not treat a source-level adapter or unit test as packaged-product proof.

## Non-negotiable security boundary

The production integration must use Codex-managed ChatGPT authentication through the supported Codex protocol. Codex owns credential storage and refresh; WorkMate may consume only safe account, authentication, plan, usage, rate-limit, and lifecycle projections exposed by that protocol.

WorkMate must not:

- read or parse `~/.codex/auth.json`;
- persist, display, log, or proxy Codex access, refresh, or ID tokens;
- call private `chatgpt.com/backend-api/codex` endpoints;
- copy Codex OAuth client identifiers, redirect URIs, or private backend behavior;
- use external `ChatgptAuthTokens` injection as the formal production login solution;
- infer login success by polling credential files.

The current adapter contains a reverse-request seam for `account/chatgptAuthTokens/refresh` and accepts an `AnswerAuth` credential payload. For M6 this is classified as `INTERNAL_ONLY` legacy plumbing. It is not an approved WorkMate account architecture and must not be surfaced as the new login path.

## Current invocation chain

The effective Codex path is:

```text
WorkMate renderer
  -> AgentAdapter
  -> WorkMate/AionCore API boundary
  -> SessionAgentTask
  -> CodexConnection / CodexSessionBackend
  -> `codex app-server` over stdio JSON-RPC
  -> Codex backend
```

The catalog still carries historical `agent_type = acp` metadata for Codex, but runtime construction special-cases the `codex` backend and creates `CodexConnection`. Codex does not run through the generic `AcpAgentManager` or the legacy `@zed-industries/codex-acp` bridge.

The executable is still the Codex CLI program: the process layer resolves an explicit program when supplied or falls back to `codex`, then launches it with the `app-server` argument. Therefore "direct CLI" is true at the process/deployment boundary, while the session transport is the structured app-server protocol rather than terminal-oriented CLI output.

This corrects the proposed migration framing: app-server is already the current repository implementation. M6 must preserve it as the stable runtime path and add supported account management around it; it must not introduce a second app-server implementation beside a fictional current ACP path.

## M6.0 audit answers

| #   | Question                                | Repository answer                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Is Codex CLI used directly?             | **Yes, as the executable host.** A resolved `codex` program is spawned with `app-server`. WorkMate does not drive the interactive terminal UI.                                                                                                                                                    |
| 2   | Is ACP used?                            | **Not for the active Codex runtime.** Historical catalog/migration metadata says ACP, but the factory routes Codex to the dedicated session backend. Generic ACP remains relevant to CodeBuddy.                                                                                                   |
| 3   | Is Codex app-server used?               | **Yes.** `CodexConnection` communicates with `codex app-server` through bidirectional stdio JSON-RPC. This is the existing path, not an unimplemented M6 alternative.                                                                                                                             |
| 4   | How is login state detected?            | **It is not passively or uniformly detected.** Authentication is inferred reactively from startup/turn failures or an app-server auth request. `/logout` sends structured `account/logout`, but there is no shared account-read/status projection or `AuthenticationState` lifecycle in WorkMate. |
| 5   | How is a session created?               | A fresh `SessionSpec` starts one app-server process for the logical WorkMate session and performs the Codex initialize/model discovery plus `thread/start` handshake. The existing implementation does not exploit one app-server process multiplexing several WorkMate sessions.                 |
| 6   | Where is the session ID stored?         | Codex emits the authoritative thread ID through `thread/started`; the backend lowers it as `BackendBound`. Conversation persistence stores it as the backend resume anchor in `acp_session.session_id` with the runtime snapshot. This is distinct from TaskSession's business-level ID.          |
| 7   | How does resume work?                   | A resume `SessionSpec` launches/rebuilds the process and sends `thread/resume` with the persisted thread ID and the full startup surface. A rejected anchor is cleared/poisoned and surfaced; the runtime must not silently create a fresh thread and call that resume.                           |
| 8   | Where does model information come from? | The app-server's structured model discovery fills `available_models`, current model, reasoning efforts, and related config options. The catalog/handshake snapshot persists the projection for UI use. A long-lived hardcoded Codex model list is unnecessary.                                    |
| 9   | Is usage available?                     | **Thread token usage is.** Structured `thread/tokenUsage/updated` notifications populate usage deltas and context occupancy. Provider cost is not invented. Account plan usage, remaining quota, and rate-limit windows are not currently exposed by the WorkMate integration.                    |
| 10  | How much CLI stdout parsing exists?     | **Substantial transport parsing, but little human-text scraping.** Stdout is line-delimited JSON-RPC and is decoded into responses, notifications, reverse requests, and typed/fallback thread items. Stderr and process-start failures still need bounded text classification for diagnostics.   |
| 11  | What can move to a structured protocol? | Most session behavior already has: initialize, model discovery, thread start/resume/fork, turn start/interrupt, streaming items, approvals, tool/MCP events, skills, token usage, collaboration events, status, and logout. The missing M6 target is supported account/login/status/limits flow.  |

## Authentication baseline

There is no shared Codex authentication model equivalent to:

```text
UNKNOWN
SIGNED_OUT
AUTHENTICATING
SIGNED_IN
EXPIRED
ERROR
```

Current behavior is reactive:

- the app-server can request authentication during runtime;
- the adapter maps that request to an auth permission event;
- existing `AnswerAuth` plumbing can inject token-shaped credentials;
- auth-related process or turn failures are mapped into the broader agent error model;
- `/logout` invokes `account/logout` and reports success or failure as a notice.

This does not meet the M6 product flow. The implementation must first evaluate the current official Codex protocol for managed login start/cancel/completion, account status, logout, plan, usage, and rate-limit data. Unsupported fields remain unknown; WorkMate must not recover them from local credential storage or private endpoints.

The desired ownership remains:

```text
Agent Center / Runtime Settings
  -> WorkMate account command
  -> authoritative main/backend process owner
  -> supported Codex app-server account method
  -> browser or device authorization managed by Codex
  -> structured account notification/state projection
```

The renderer must not own the Codex process, OAuth flow, or credentials.

## Session lifecycle baseline

The dedicated backend supports `Fresh`, `Resume`, and `Fork` session specifications. It maps them to `thread/start`, `thread/resume`, and `thread/fork`, then waits for an authoritative `thread/started` binding.

The current lifecycle already includes:

- persistent process ownership and structured initialization;
- prompt send and streaming events;
- whole-turn cancellation through `turn/interrupt`;
- approval/rejection flows;
- suspend/wake and process rebuild;
- native resume replay after rebuild;
- fail-closed handling for rejected or missing resume bindings.

At source level, Codex resume is implemented as native resume. The final `RuntimeDescriptor.resume = NATIVE` product claim remains gated by a packaged Windows restart test. TaskSession startup recovery also remains fail closed: an interrupted business task is not automatically replayed merely because a Codex thread can be resumed.

## Model, usage, and rate-limit baseline

Model information is provider-reported through the structured protocol and projected through session capabilities and persisted handshake metadata. M6 should retain `Default / Auto` plus available models returned by Codex, without inventing model identifiers or unsupported selection scopes.

The current usage path is thread-scoped:

```text
thread/tokenUsage/updated
  -> UsageDelta
  -> durable usage ledger
  -> AgentAdapter usage projection
```

It can represent input, output, reasoning, cached, and total token fields when supplied. Missing cost remains absent. It is not evidence for ChatGPT plan consumption, account quota, remaining allowance, or reset time.

M6 must distinguish at least:

```text
runtime_reported_thread_usage
provider_reported_account_usage
provider_reported_rate_limit
unknown
```

No prompt-length token estimate may be labeled as provider-reported usage.

## Structured protocol coverage

| Area                                | Current state                                | M6 action                                                                                           |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| initialize and process handshake    | `IMPLEMENTED`                                | Preserve                                                                                            |
| model discovery and selection       | `IMPLEMENTED`                                | Preserve and expose accurately                                                                      |
| thread start/resume/fork            | `IMPLEMENTED`                                | Add packaged evidence                                                                               |
| turn send/stream/complete/interrupt | `IMPLEMENTED`                                | Add packaged evidence                                                                               |
| approvals and tool/MCP events       | `IMPLEMENTED`                                | Preserve policy mediation                                                                           |
| skills and collaboration events     | `IMPLEMENTED`, semantics partly unnormalized | Do not overclaim subagent guarantees                                                                |
| thread token usage                  | `IMPLEMENTED`                                | Preserve provenance                                                                                 |
| logout                              | `IMPLEMENTED` as a slash-command path        | Move behind an explicit account contract and UI                                                     |
| login start/cancel/completion       | `NOT IMPLEMENTED` in WorkMate                | Evaluate official current app-server methods before design                                          |
| account status and auth mode        | `NOT IMPLEMENTED`                            | Add only from supported structured data                                                             |
| plan, account usage, rate limits    | `NOT IMPLEMENTED`                            | Add nullable fields only where officially reported                                                  |
| external token refresh injection    | `INTERNAL_ONLY`                              | Exclude from the formal production design; do not expose credentials across renderer/API boundaries |

Unknown thread item types are retained as adapter-specific structured values rather than interpreted as terminal prose. This provides forward compatibility, but unknown items must not be promoted to supported product capabilities without an explicit mapping and tests.

## Availability, errors, and diagnostics

Codex installation detection currently resolves the executable and invokes `codex --version` with a timeout. The result can report missing command, non-zero exit, timeout, and version drift. There is no evidence-backed hard minimum version contract, so M6 must not invent one.

The existing `AgentErrorCode` taxonomy already distinguishes installation, startup, handshake, protocol, authentication, session, provider rate-limit, network, and model failures. M6 needs a Codex-facing projection that consistently covers:

```text
NOT_INSTALLED
NOT_AUTHENTICATED
AUTH_EXPIRED
UNSUPPORTED_VERSION
START_FAILED
SESSION_FAILED
RATE_LIMITED
NETWORK_ERROR
PROTOCOL_ERROR
RUNTIME_CRASHED
CANCELLED
```

Diagnostics may include the sanitized Codex version, integration mode, auth state, failing operation, runtime state, and safe remediation. They must not include tokens, cookies, credential file contents, credential paths, or raw unredacted upstream payloads.

## Runtime descriptor implications

The current frontend `AgentAdapter` already normalizes create/resume/send/cancel/status/approval/usage/subscription and should be extended, not replaced. Its hardcoded brand-keyed booleans are insufficient for the M6 claims.

A future Codex descriptor needs evidence-backed values for:

```text
provider = OpenAI
integration = APP_SERVER
authentication = UNKNOWN | SIGNED_OUT | AUTHENTICATING | SIGNED_IN | EXPIRED | ERROR
auth_mode = CHATGPT | API_KEY | UNKNOWN
availability
version
resume = NATIVE | EMULATED | UNSUPPORTED | UNVERIFIED
model_selection
usage_reporting
rate_limit_reporting
planning_isolation = BEST_EFFORT
```

Codex planning isolation remains `BEST_EFFORT`. Its sandbox evidence does not prove that every network, MCP, or delegated mutation path is host-blocked, so M6 must not upgrade it to `GUARANTEED` without the complete M3 mutation proof.

## Scope boundary

M6 implementation priority is:

1. evaluate the current official Codex app-server account surface;
2. evaluate Sign in with ChatGPT separately from the Codex runtime;
3. define the safe Codex account/auth contract;
4. implement login, account state, and logout through the authoritative process layer;
5. retain the existing structured session runtime and add packaged evidence;
6. expose provider-reported usage, limits, errors, and diagnostics without invention;
7. close only after real Windows packaged login/session/restart/logout/error scenarios pass.

Claude Code and CodeBuddy remain maintenance-only compatibility paths. Aion remains the strict-planning reference. M6 does not redesign Agent Center, replace CodeBuddy ACP, upgrade Codex planning isolation, implement an unofficial OAuth client, or make a direct Responses provider equivalent to the Codex agent runtime.

## Required evidence and closure rule

Source tests can establish protocol mapping and fail-closed behavior, but they cannot close M6. Closure requires a packaged Windows WorkMate using a released AionCore dependency and a real supported Codex/ChatGPT flow for:

- clean signed-out detection and an actionable login entry;
- one managed login flow with duplicate-start prevention and cancellation;
- structured login completion and accurate account state;
- session create, send, stream, complete, and cancel;
- restart with correct auth state and native thread resume;
- explicit logout followed by confirmed `SIGNED_OUT` behavior;
- unauthenticated, network/protocol, runtime crash, and rate-limit mapping where safely reproducible;
- sanitized Trace, Review, and diagnostics with no credential leakage.

Until those gates pass:

```text
M6 = OPEN
```
