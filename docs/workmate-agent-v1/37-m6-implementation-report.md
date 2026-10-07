# M6 Codex and ChatGPT Integration Report

## Status

```text
IMPLEMENTATION = COMPLETE
STABLE AIONCORE RELEASE = v0.2.17 PUBLISHED
WORKMATE RELEASE = v2.4.0 PUBLISHED
REAL CHATGPT ACCOUNT ACCEPTANCE = PENDING

M6 = OPEN
M7 = NOT STARTED
```

This is the implementation report for M6, not the closure declaration. The immutable package identity and remaining real-account gates are recorded in [36-m6-packaged-validation.md](./36-m6-packaged-validation.md).

## Delivered scope

WorkMate `v2.4.0` contains only the frozen release scope:

- M6.1 Codex-managed ChatGPT authentication;
- M6.2 native Codex thread binding and resume;
- M6.3 dynamic model discovery, selection, and reasoning effort;
- M6.4 usage, rate limits, diagnostics, and cache invalidation;
- restored permanent Conversation Delete with fail-closed active-task handling.

M7 workflow routing, Agent Router, SIWC, CodeBuddy and Claude enhancements, KnowHub features, broad upstream synchronization, and UI redesign remain excluded.

## Architecture and credential ownership

The production path is:

```text
WorkMate renderer
  -> typed IPC / main-process services
  -> AionCore account, conversation, and session APIs
  -> dedicated Codex session backend
  -> user-installed Codex app-server
  -> Codex-managed ChatGPT account and native threads
```

WorkMate does not request, parse, persist, refresh, or log ChatGPT access, refresh, or ID tokens. It does not inspect Codex credential files or private thread storage. Codex owns browser login, callback, credential storage, and refresh; WorkMate consumes reduced account and diagnostic projections.

Codex is not bundled with the installer. The executable is resolved from the user's `PATH`. AionCore `v0.2.17` records `0.160.1` as the live-verified protocol baseline and reports older/newer runtime drift without silently substituting another executable. The acceptance machine's actual `codex --version` remains a required real-run datum.

## Session, model, and usage behavior

Fresh sessions use `thread/start`; resumed sessions use `thread/resume {threadId}`; turns use `turn/start`; cancellation uses `turn/interrupt`. The authoritative Thread ID is persisted in the runtime binding, and generation fencing prevents late events from a previous process or thread from mutating the active task.

Models are discovered through paginated `model/list`; permanent GPT names are not hardcoded. Auto remains distinct from an explicit request, unsupported efforts fail validation, and resume reconciles the effective model returned by the runtime.

Account allowance, provider account activity, and thread token counters remain separate projections. Sparse notifications merge only present fields, stale Thread IDs are fenced, and logout or account identity changes invalidate cached account/model/limit/usage state. `RATE_LIMITED` remains terminal even if a later generic completion arrives.

## Conversation delete hotfix

The missing Recent Conversation delete entry was a renderer wiring regression: the authoritative delete bridge and HTTP route still existed, but the menu and action hook no longer exposed them. WorkMate `v2.4.0` restores the action after Archive, adds explicit confirmation across all 13 locales, clears current-route and recent-list state after success, and preserves Rename, Pin/Unpin, and Archive behavior.

AionCore `v0.2.17` adds the required authoritative safety:

- atomically reserves idle runtime deletion and rejects active turn/tool/cancelling/restarting states;
- returns stable HTTP `409 CONVERSATION_ACTIVE`;
- rejects M4 task sessions in `running` or `waiting_approval`;
- deletes completed TaskRun roots before TaskSession and Conversation roots so restrictive references cannot leave partial cleanup;
- preserves Codex-owned credentials, rollout files, and private thread storage.

The detailed ownership and FK table is in [38-conversation-delete-hotfix.md](./38-conversation-delete-hotfix.md).

## Release evidence

AionCore `v0.2.17` is published from `6fa1d3e83f8f8ec1cf07b74dd092d7f122e6ab10`. Its official release workflow built six platform archives, and every archive SHA-256 matched `aioncore-checksums.txt`.

WorkMate [`v2.4.0`](https://github.com/suoak/AionUi/releases/tag/v2.4.0) is published from `d7e6961838fb3348fd9f4e380ad4a4808eb893bb`. PR #171, the final merged-main gates, release attempt 2, and the release-event final-asset workflow passed. Both release runs passed the Windows fresh-install smoke jobs; the final-asset workflow also passed its manifest signing self-check before upload. The immutable final Windows installer identity and independent public-asset verification are tracked in document 36.

## Known limitations and deferred work

- Real OAuth, live inference, native semantic resume, actual model selection, real limits/usage, logout invalidation, and post-logout execution still require the joint Windows acceptance.
- Codex `PlanningIsolation` remains `BEST_EFFORT`; Aion Agent remains the `GUARANTEED` strict-planning reference runtime.
- Provider-optional usage may legitimately be `UNAVAILABLE` and must not be fabricated.
- M7 remains `NOT STARTED` until M6.1–M6.4 and M6 are closed by real-account evidence.

The accurate conclusion remains:

```text
Codex / ChatGPT Integration = RELEASE-INTEGRATED CANDIDATE
PRODUCTION BASELINE ESTABLISHED = PENDING REAL ACCOUNT ACCEPTANCE
```
