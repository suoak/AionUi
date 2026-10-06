# M5 context baseline

## Audit scope and baseline

This audit starts M5, **Enterprise Context & KnowHub Evidence**, after the M4.5 integration gate closed.

- WorkMate baseline: `c10170c3a` (`feat(review): add execution review center (#156)`).
- Released runtime: AionCore `v0.2.15`, tag target `9d3f1a65`.
- AionCore release run `37440480023`: six platform builds and checksum upload passed.
- WorkMate PR Checks run `37442542817`: quality, i18n, tests, coverage, three packaged builds, Windows packaged Review gate and installer smoke passed.

The scan covered WorkMate, AionCore and the pinned `aionrs` source for MCP, KnowHub, knowledge search, conversation context, project/workspace, artifacts, evidence and agent prompt injection. No KnowHub implementation or service contract is present in these repositories. GitHub repository searches for `knowhub` and `knowledge` under both `suoak` and `iOfficeAI` also returned no auditable repository on 2026-10-06.

## Existing context flow

```text
Conversation row
    -> typed AgentSessionContext
       - conversation/user/runtime identity
       - workspace path
       - model
       - skills
       - runtime environment
       - team binding
       - backend-specific session config
    -> runtime factory
    -> first-message prompt hook
       - preset context
       - skill index
    -> agent runtime
```

Task execution is connected to the conversation by `TaskSession.conversation_id`. A task can also carry `project_id`, but the project is currently validated as user-owned metadata; it is not resolved into provider recommendations or injected knowledge. The runtime factory context carries conversation/user/workspace, not task/project/knowledge context.

## Reuse matrix

| Existing capability | Owner | Current behavior | M5 decision |
| --- | --- | --- | --- |
| `TaskSession` task/project/conversation identity | AionCore conversation API | Persists and validates user-owned task bindings | Reuse as the query/snapshot ownership root |
| Conversation workspace resolution | AionCore conversation + agent runtime | Resolves a validated custom or managed workspace before runtime creation | Reuse through a future `WorkspaceContextProvider` |
| Project and folder identity | AionCore project service | User-scoped project lookup, attached roots and stable project refs | Reuse for deterministic provider discovery |
| Filesystem providers and filename search | AionCore project runtime | Provider-neutral filesystem operations and bounded filename search | Reuse primitives; do not treat filename search as enterprise knowledge retrieval |
| Git/SCM provider | AionCore project runtime | Provider-neutral repository discovery, status, diff and original content | Reuse through a future `GitContextProvider` |
| Conversation history/messages | AionCore conversation service | User-scoped persisted conversation stream and replay | Reuse as conversation context; keep separate from enterprise knowledge provenance |
| Preset context + prompt pipeline | AionCore agent runtime | First-message hook injects frozen preset context and skills | Extend with a bounded, typed context block after retrieval; do not concatenate provider-specific payloads in the UI |
| User MCP server catalog | AionCore MCP | User-scoped CRUD, stdio/SSE/HTTP transport, connection test and `tools/list` persistence | Reuse as transport/configuration, not as the Context abstraction |
| Session MCP injection | AionCore agent runtime | Resolves selected/enabled servers into a neutral session shape; malformed/unavailable servers are skipped | Reuse only after provider capability and policy checks; current best-effort skipping is insufficient for required context |
| MCP OAuth token store | AionCore MCP | OAuth operations are scoped by Core user and server URL | Reuse transport auth plumbing; identity-to-KnowHub authorization semantics remain unproven |
| Agent Center `knowledge_scopes` | AionCore + WorkMate types | Persists `knowhub_space_id`, optional node IDs and access string | Treat as dormant metadata only; it has no runtime consumer and must not define M5 authorization |
| Planning policy | AionCore agent runtime | Allows trusted `McpRead`, denies `McpWrite`, and denies unknown/untrusted metadata | Reuse and extend with explicit `knowledge.read`; strict Aion planning must remain fail closed |
| Trace/checkpoint/evidence | AionCore conversation + DB | Ordered trace, restart-persistent checkpoints, redacted evidence; DB already permits `mcp` and `knowledge` evidence kinds | Reuse directly for context query/use evidence |
| Immutable plan + hash-bound approval | AionCore task session | Approval binds the exact plan artifact hash | Reuse unchanged; changed context requiring a changed plan produces a new artifact and approval |
| Review API/UI | AionCore + WorkMate | Aggregate run review and focused views, with lazy retained-output loading | Extend the existing Review surface with Context/Evidence; do not create a separate KnowHub history system |

## MCP versus agent-runtime responsibilities

### MCP layer

The existing MCP layer owns server configuration, user scoping, transport negotiation, authentication, connection testing, tool discovery and session injection. A discovered tool currently contains only `name`, `description` and `input_schema`; it has no trusted read/write classification, resource provenance contract or permission-scope declaration.

MCP is therefore a possible adapter transport for KnowHub, not the M5 domain model. A generic MCP server or a tool whose mutability cannot be proven must remain denied in strict planning.

### Agent runtime

The agent runtime owns typed conversation/workspace construction, runtime selection, prompt hooks, skills, tool-policy enforcement and event streaming. It currently has no task-aware context resolver and no provider-neutral knowledge query/result type.

M5 should add context resolution before prompt injection and preserve a stable snapshot before the resulting context can influence planning or execution.

### New context layer

The missing layer must own:

- provider identity and capability discovery;
- deterministic source recommendation from task, project, workspace and agent;
- `ContextQuery` normalization across planning, execution and verification;
- permission-aware provider authorization;
- provider aggregation without client-side permission guessing;
- stable provenance, freshness, deduplication and budget enforcement;
- `ContextSnapshot` persistence and plan/run linkage;
- conversion of actual context use into M4 trace/evidence/review records;
- required-versus-optional failure semantics.

It must not own provider ranking internals that KnowHub already supplies, MCP credentials, plan mutation, approval bypasses or knowledge write-back.

## Required first contracts

The first implementation should introduce provider-neutral contracts equivalent to:

```text
ContextProvider
  identity()
  capabilities()
  discover()
  search()
  fetch()
  authorize()
  provenance()

ContextQuery
  task_id
  project_id
  query
  scope
  limit
  filters
  purpose = planning | execution | verification

ContextHit
  provider + canonical source id
  tenant / space / knowledge base / document
  title + bounded snippet + score
  permission scope
  version/updated_at + retrieved_at
  provenance
```

Capability declarations must distinguish `single_scope`, `multi_scope`, `all_accessible`, `provenance`, `permission_aware`, `freshness` and `content_fetch`. Unsupported capability combinations must fail explicitly; the UI must not simulate them.

## Snapshot and evidence seam

M4 already provides the correct audit root. M5 should persist a compact context snapshot containing stable references, bounded/redacted snippets, hashes, provenance and retrieval time rather than full documents. Plan artifacts and runs then reference that snapshot. Knowledge acquired during execution produces additional trace/evidence and must trigger re-plan/re-approval when it materially changes the approved plan.

`task_evidence.kind` already accepts `knowledge` and `mcp`, and its metadata is passed through the M4 sanitizer. The first M5 schema should extend linkage, not create a parallel KnowHub history table.

## Baseline gaps and gates

| Gap | Consequence | Gate before implementation claim |
| --- | --- | --- |
| No KnowHub adapter or contract | No real knowledge retrieval exists | Obtain and test the real MCP/API contract |
| `knowledge_scopes` is persistence-only | Configuring a space does not affect runtime | Add a runtime consumer behind `ContextProvider` |
| No trusted MCP tool capability metadata | Tool name/description cannot prove read-only behavior | Signed/server-owned classification or a dedicated audited adapter |
| No all-accessible contract | Client cannot safely aggregate spaces | Prefer one server-side permission-filtered endpoint |
| No stable result provenance model | Evidence cannot answer where knowledge came from | Require canonical tenant/space/KB/document identity |
| No snapshot persistence/linkage | Restart and approval audit cannot reproduce context | Add context snapshot plus immutable plan/run links |
| Project is not in runtime context | Provider discovery cannot be deterministic | Add task/project/workspace inputs to `ContextResolver` |
| Best-effort MCP injection skips failures | Required knowledge could disappear silently | Add required `needs_context` fail-closed semantics |

## Scope boundary

This baseline does not start Agent Router, Enterprise Workflow, native OAuth, full enterprise RBAC, analytics, KnowHub writes or automatic knowledge deposition. M5 remains read-only `Knowledge -> Agent`, using a deterministic resolver plus project mapping and optional user confirmation.

