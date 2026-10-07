# M6.3 Codex model discovery and selection

## Status and scope

```text
M5   = PARTIAL / OPEN
M6   = OPEN
M6.1 = IMPLEMENTED / CLOUD AND PACKAGED BUILD VERIFIED / REAL AUTH ACCEPTANCE PENDING
M6.2 = IMPLEMENTED / CLOUD AND PACKAGED FIXTURE VERIFIED / REAL SESSION ACCEPTANCE PENDING
M6.3 = IMPLEMENTED / CLOUD AND PACKAGED FIXTURE VALIDATION PENDING
```

This slice covers Codex model discovery, projection, user selection, reasoning-effort validation, persistence, resume reconciliation, and per-turn review evidence. It does not implement M6.4 usage, rate-limit, or account diagnostics, a provider marketplace, automatic model routing, benchmarks, or experimental `turn/settings/update` behavior.

The protocol authority for this implementation is the generated schema from bundled `codex-cli 0.160.1` under `C:\Users\suchen\aion\protocols\samples\codex-cli\0.160.1\schema-full`.

## Baseline audit

| #   | Question                                               | Verified repository answer before M6.3 changes                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where is the Codex model list defined?                 | `aionui-session/src/backend/codex_conn.rs` sends `model/list` after app-server initialization and projects its response into generic `Capabilities.available_models`. `aionui-ai-agent/src/session_agent.rs` then exposes that generic catalog through config options and persists a reduced snapshot in agent metadata.                                                                                    |
| 2   | Are OpenAI model names hardcoded?                      | No hardcoded Codex picker list is used on the direct Codex path. Model-shaped constants do exist elsewhere for AionRS/image capability rules and in tests, but the Codex selector is populated from runtime discovery. The current Codex fallback is the app-server default, not a WorkMate-owned GPT identifier.                                                                                           |
| 3   | What owns model selection?                             | The persisted request is conversation/session scoped: `current_model_id` lives in the conversation ACP runtime state and is resolved into `SessionConfig.model`. The generic renderer selector reads and writes session config options. It is not an app-global Codex choice.                                                                                                                               |
| 4   | Does `thread/start` carry a model?                     | No. The current implementation deliberately omits `SessionConfig.model`, starts with the Codex default, then reconciles the requested model after discovery. This was a compatibility safeguard for stale selections.                                                                                                                                                                                       |
| 5   | Does `turn/start` carry a model?                       | No. The current send path emits only `threadId` and `input`; model changes are applied out of band through `thread/settings/update`. This conflicts with M6.3's turn-boundary contract.                                                                                                                                                                                                                     |
| 6   | How is reasoning effort configured?                    | Model discovery retains only effort tokens. `session_agent.rs` exposes a generic `reasoning_effort` config option for the currently selected model, while Codex dispatch currently applies it through `thread/settings/update`. Default effort, descriptions, and invalid-combination fallback are not represented.                                                                                         |
| 7   | Do Codex and other providers reuse one UI?             | Yes. `AcpModelSelector` and `useAcpModelInfo` consume generic ACP config options for direct Codex, Claude, and ACP agents. The shared surface currently has no Codex catalog freshness, refresh, hidden/default/upgrade, or service-tier semantics.                                                                                                                                                         |
| 8   | Is selection persisted in Conversation or TaskSession? | The requested model and generic config selections are persisted with conversation runtime state. TaskSession does not own a separate model preference. Review currently projects runtime binding information but not a complete per-turn effective Codex model/effort/tier tuple.                                                                                                                           |
| 9   | How is model restored after resume?                    | `session_context.rs` resolves the persisted `current_model_id` into `SessionConfig.model`. The backend seeds its current-model snapshot, resumes the thread, loads `model/list`, and reconciles through `thread/settings/update`. The authoritative `thread/resume` response model is not yet used to resolve local/runtime drift.                                                                          |
| 10  | What legacy compatibility exists?                      | The discovery parser accepts both the current `result.data[]` shape and the former `result.models[]` shape, plus object and string effort entries. An empty catalog is treated permissively for model setting, and persisted pre-init catalog data may populate the selector until live discovery arrives. These behaviors need explicit stale/legacy states instead of being mistaken for a fresh catalog. |

### Protocol findings

The following claims are schema-verified against `codex-cli 0.160.1`:

- `v2/ModelListParams.json`: `cursor`, `limit`, and `includeHidden` are optional inputs.
- `v2/ModelListResponse.json`: each page returns `data[]` and optional `nextCursor`; model identity is the verbatim `id` field.
- `v2/ModelListResponse.json`: a model provides display/description, hidden/default flags, default and supported reasoning efforts, service tiers, upgrade metadata, and optional multi-agent metadata. WorkMate must project only fields it consumes.
- `v2/ThreadStartParams.json`: `model`, `modelProvider`, and `serviceTier` are optional.
- `v2/TurnStartParams.json`: `model`, `effort`, and `serviceTier` override the current and subsequent turns. They are the non-experimental M6.3 turn-boundary selection surface.
- `v2/ThreadStartResponse.json` and `v2/ThreadResumeResponse.json`: the response exposes the actual thread model, reasoning effort, provider, and service tier. Runtime values win over a persisted request after resume.

### Baseline gaps

- Only the first `model/list` page is requested; `nextCursor` is ignored.
- Catalog model IDs are not deduplicated across pages because pages are not accumulated.
- The generic `ModelInfo` projection omits default model/effort, visibility, service tiers, upgrade metadata, and multi-agent capability.
- No explicit Auto value exists; omission of a model override cannot be selected after an explicit choice.
- Refresh, loading, fresh/stale/unavailable state, provider-restart-required normalization, login refresh, and logout invalidation are absent.
- Unsupported persisted reasoning effort is not reset to Auto/default before the next Codex turn.
- Codex model/effort switching depends on `thread/settings/update`, which is out of scope for this version.
- Resume does not reconcile the authoritative model returned by `thread/resume`.
- Review does not yet prove the effective model/effort/service tier for each TaskRun/Turn.

## Target contract

The authoritative flow is:

```text
Codex app-server initialized
  -> model/list(includeHidden=false, cursor, limit)
  -> all pages merged and deduplicated by exact model.id
  -> stable WorkMate CodexModelDescriptor projection
  -> conversation-scoped requested selection
  -> thread/start or next turn/start override
  -> runtime-confirmed effective selection
  -> Task Trace / Review evidence
```

`Auto / Codex Default` means no WorkMate model override. WorkMate never aliases, lowercases, strips a provider prefix from, or silently replaces a server-advertised model ID. Requested and effective values remain distinct.

## Implementation

### Catalog service and lifecycle

The per-session Codex backend owns one catalog snapshot. It loads after app-server initialization and uses the exact request contract:

```json
{ "cursor": null, "limit": 100, "includeHidden": false }
```

Each `nextCursor` is requested until null. Pages are accumulated in server order, exact IDs are deduplicated, hidden entries are excluded defensively, and only the completed snapshot is published. Repeated cursors and a 100-page safety bound prevent protocol loops. Manual Refresh uses the same service and does not run on every render.

Refresh failure keeps a prior valid snapshot and emits a stale warning. With no prior snapshot it reports catalog unavailable. Provider/restart-shaped `-32600` failures normalize to `Codex model catalog needs runtime restart`; they do not delete the TaskSession or thread. Logout invalidates the model snapshot immediately. Authentication-dependent signed-out behavior remains a real-account gate.

### Stable projection

`ModelInfo` carries an optional Codex projection rather than renderer-facing raw JSON:

- exact `id`, display name, description, visibility, and default flag;
- supported/default reasoning effort;
- service tiers and default tier;
- upgrade/replacement/retirement copy;
- multi-agent capability;
- nullable context-window and raw-capability-version fields.

The bundled 0.160.1 schema does not guarantee context-window fields, so WorkMate leaves them null instead of inventing values. Unknown upstream fields are ignored. The projection is persisted with the reduced catalog snapshot; raw responses and account data are not persisted.

### Selection contract

The shared ACP selector is extended rather than duplicated. Codex receives `Auto (Codex default)` plus every selectable server ID and a lightweight Refresh action. Auto is an internal preference sentinel and is never sent to Codex. An explicit ID is returned byte-for-byte.

Model and reasoning changes are idle-only. Codex no longer uses experimental `turn/settings/update` for either axis. `CommandMeta` carries the selected model, validated effort, and service tier to the next `turn/start`; Auto omits the field. The existing thread and TaskSession remain unchanged across model switches.

The first implementation exposes service tier as Auto. Although catalog tiers are projected, WorkMate does not infer entitlement from ChatGPT plan and does not expose speculative tier choices.

### Reasoning effort

Effort options are derived from the selected model's `supportedReasoningEfforts`. Codex also exposes Auto, which omits `turn/start.effort`. Switching models immediately revalidates the stored effort; an unsupported value is cleared to model default/Auto. The send boundary validates once more, omits an invalid value, emits `CODEX_REASONING_EFFORT_UNSUPPORTED`, and never maps one level to another.

### Persistence and resume

Requested model and effort remain conversation/runtime preferences. `codex_requested_model` preserves the distinction between Auto and a concrete request, while `current_model_id` remains the runtime-facing snapshot. `thread/resume` response model updates the backend's authoritative runtime model. A disappeared model is excluded from new selection without deleting task history; a still-resumable legacy thread remains intact.

### Trace and Review

At every Codex send boundary, WorkMate emits one reduced `runtime_model_selected` record containing only requested model, best-known effective model, validated effort, and Auto service tier. Task Trace persists it as `runtime.model.selected`, so Review can distinguish successive turns without copying the complete catalog or raw protocol payload.

## Tests

Automated coverage includes:

- current and legacy single-page response shapes;
- three-page cursor traversal, stable merge, duplicate-ID removal, and hidden exclusion;
- default/effort/optional metadata projection;
- explicit model/effort/service-tier mapping to `turn/start`;
- idle-only model and effort changes with no `thread/settings/update` frame;
- invalid model and effort rejection/fallback;
- authoritative model capture from `thread/resume`;
- logout invalidation and catalog failure normalization;
- per-run reduced model evidence and redaction.

Local development checks passed for the Core compile and 146 Codex protocol tests. The conversation trace test could not complete locally because the Windows build volume ran out of disk space; this is delegated to the required GitHub validation rather than treated as product failure. AionUi locale structure and generated key synchronization pass for all 13 locales; Bun-based renderer and packaged validation are delegated to GitHub because Bun is unavailable locally.

## Packaged fixture evidence

Pending GitHub run links and packaged artifact identifiers will be added after both branches are pushed and the cloud workflow completes. The fixture must prove the request, three-page pagination, projection, boundary selection, effort validation, persistence/resume, and `runtime.model.selected` Review evidence without asserting a particular GPT model name.

## Provider limits and real acceptance pending

M6.3 promises the catalog for the current Codex startup/default provider only. It does not implement `modelProvider` routing, universal-provider discovery, account-plan-based filtering, benchmarks, or automatic model routing.

One joint real ChatGPT-account acceptance remains for M6.1/M6.2/M6.3: OAuth, `account/read`, live `model/list >= 1`, choose one advertised model and supported effort, multi-turn execution, process restart, native `thread/resume`, authoritative model check, and logout invalidation. Until that run completes, `REAL MODEL ACCEPTANCE` remains pending.
