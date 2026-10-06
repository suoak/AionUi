# Context snapshot and evidence

## Purpose

M5 records the exact bounded knowledge references that influenced a run. A review must be able to answer which provider, source, space, knowledge base, document, version, query, and permission scope were used without copying whole enterprise documents into SQLite.

## Persistence model

AionCore migration `063_context_snapshots.sql` adds two task-owned tables:

```text
context_snapshots
  id
  task_session_id
  run_id
  provider
  query
  scope
  purpose
  result_refs
  snapshot_hash
  created_at

context_snapshot_artifacts
  task_session_id
  snapshot_id
  artifact_id
  created_at
```

Every snapshot belongs to an existing TaskSession and run. Composite foreign keys prevent a snapshot from being linked to an artifact from another task. The run relation makes snapshots restart-persistent and reviewable for planning as well as execution runs. The artifact join supports one plan using several provider snapshots and one snapshot being retained with the artifact it influenced.

The new tables are explicitly classified as TaskSession-parent-scoped by the AionPro adoption coverage gate.

## Snapshot contents

`result_refs` contains bounded `ContextHit` records:

- canonical provider and source IDs;
- title and small snippet;
- optional provider score;
- permission scope;
- optional document version or update time;
- retrieval time and optional content hash;
- tenant, space, knowledge-base, and document provenance;
- bounded provider provenance data.

It does not contain a fetched full document. Large content remains behind a provider reference and requires a separately authorized fetch.

Before persistence, the existing M4 sanitizer:

- redacts authorization, token, cookie, password, and secret fields;
- redacts inline credential patterns;
- bounds strings and arrays;
- sanitizes provider provenance data, query text, snippets, trace payloads, and evidence metadata.

The snapshot hash is computed from the sanitized provider, query, scope, purpose, and result references. Consequently, Review describes the persisted view rather than hashing secret material that was later removed.

## Trace and evidence integration

Recording actual context use produces:

```text
Trace event: context.used
  snapshot_id
  snapshot_hash
  provider
  purpose
  scope
  hit_count

Evidence kind: knowledge (one per retained hit)
  provider
  source_id
  query
  snippet/reference
  content_hash
  version_or_updated_at
  retrieved_at
  permission_scope
  provenance
```

The evidence reuses M4 `task_evidence`; there is no parallel KnowHub history table. Snapshot/evidence writes are scoped through the same user-owned TaskSession and run repository.

The Task Review API now includes `context_snapshots` alongside trace, checkpoints, and evidence. Response conversion sanitizes persisted values again as defense in depth. WorkMate can render the existing Review surface from this payload without a separate large KnowHub page.

## Plan and approval semantics

The snapshot-to-artifact join records which context influenced a Plan artifact. It does not modify the artifact content or hash. M2 semantics remain:

```text
Plan V1 + hash-bound approval
```

If later context materially changes the execution path, the runtime must create Plan V2 and request a new approval. A snapshot or newer provider result must never mutate an approved Plan V1 in place.

Execution may record additional snapshots and knowledge evidence. That evidence is reviewable, but the automatic material-change/re-plan decision is not yet wired and must not be claimed complete.

## Failure and consistency semantics

- Unknown, untrusted, non-permission-aware, or provenance-free providers fail closed before planning retrieval.
- A provider returning a hit that fails the authorization recheck fails closed.
- Snapshot rows cannot be created for a run outside the requesting user's TaskSession.
- Snapshot/artifact links cannot cross TaskSession ownership.
- Missing production KnowHub context is still a capability blocker; no best-effort client-side space guessing is allowed.

Required-versus-optional context orchestration remains to be connected to TaskSession execution. When added, required context must resolve to `needs_context`; optional context may continue only with an explicit warning and trace.

## Remaining work

The following are not completed by the neutral persistence layer:

- a real `KnowHubContextProvider` and authenticated identity mapping;
- proven single-space, multi-space, or all-accessible KnowHub behavior;
- automatic Project Context Resolver invocation before planning;
- provider query injection into the Agent prompt;
- material-change detection and automatic re-plan/re-approval;
- WorkMate Context/Evidence rendering;
- released-AionCore packaged E2E against a real KnowHub environment.

M5 therefore remains open even when the neutral contract and persistence CI are green.
