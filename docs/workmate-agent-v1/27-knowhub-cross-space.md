# KnowHub cross-space acceptance contract

## Status

This document is the executable acceptance contract for a future production `KnowHubContextProvider`. It is **not** evidence that the current product supports KnowHub, multi-space search, or `all_accessible` retrieval.

As of 2026-10-07, the real KnowHub MCP/API schema, authenticated subject mapping, permission model, and authorized integration fixture are unavailable in the audited repositories. Every production capability in this document therefore remains **UNVERIFIED**. WorkMate must keep the provider and related UI disabled until the required evidence is available.

## Required server semantics

The preferred operation is a server-side query equivalent to:

```text
search_my_accessible_knowledge(
  authenticated_subject,
  query,
  purpose,
  limit,
  filters,
  cursor?
)
```

The operation name is not normative. Its security semantics are:

1. derive the enterprise subject from authenticated server state;
2. compute the subject's readable spaces, knowledge bases, and documents on the server;
3. search only that authorized set;
4. apply provider-native retrieval and ranking;
5. return stable, result-level provenance and permission scope;
6. reveal no identifiers, counts, titles, snippets, scores, or timing distinctions for inaccessible content;
7. recheck authorization when content is fetched after search.

Client-supplied subject, tenant, space, or knowledge-base identifiers are selectors only. They never grant access. WorkMate must not guess space IDs, crawl configured spaces, or treat `KnowledgeScopeRef` metadata as authorization proof.

## Capability mapping

The adapter may advertise a capability only when the real operation passes the corresponding integration tests:

| Provider capability | Required KnowHub evidence                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `single_scope`      | An authenticated query can select one authorized scope and rejects an unauthorized scope without disclosure |
| `multi_scope`       | One request can search an explicit authorized scope set with result-level authorization and provenance      |
| `all_accessible`    | The server derives and searches the caller's entire readable corpus without a client-maintained space list  |
| `permission_aware`  | Search and fetch enforce the authenticated subject's current document permission                            |
| `provenance`        | Every hit identifies its provider, canonical source, space, knowledge base, and document                    |
| `freshness`         | Every hit supplies a real version or update time; unavailable values remain null                            |
| `content_fetch`     | Fetch reauthorizes the exact source and returns bounded content or a stable reference                       |

An adapter must advertise only the proven subset. `multi_scope` does not imply `all_accessible`, and transport authentication does not imply `permission_aware`.

## Acceptance fixture

The provider-owned integration environment must contain a uniquely identifiable topic and this authorization graph:

```text
User A
  can read Space 1 / KB Alpha / Document A
  can read Space 2 / KB Beta  / Document B
  cannot read Space 3 / KB Gamma / Document C

User B
  can read Space 3 / KB Gamma / Document C
  cannot read Space 1 or Space 2
```

The fixture must also contain:

- one canonical document replicated or indexed in both Space 1 and Space 2;
- two different documents with the same title;
- one document with version or `updated_at` metadata;
- one document for which freshness metadata is genuinely unavailable;
- one permission that can be revoked between search and fetch;
- marker text in Space 3 that would make any unauthorized leakage unambiguous.

Fixture identifiers and content must be synthetic and safe to retain in CI logs. Credentials must be injected through the repository's secret mechanism and must never be written to artifacts, trace, evidence, snapshots, screenshots, or test output.

## Mandatory integration cases

### Authorized aggregation

For User A, an `all_accessible` query for the fixture topic must return authorized hits from Space 1 and Space 2. It must return zero content and zero metadata from Space 3. Every returned hit must include canonical provider/source, space, knowledge-base, document, permission-scope, and retrieval provenance.

The same query as User B must not expose Space 1 or Space 2. Comparing the two subjects proves that the result set is derived from the authenticated identity rather than a renderer-supplied scope list.

### Scope validation

If the provider advertises `single_scope`, User A may query Space 1 and must be denied for Space 3. If it advertises `multi_scope`, a request containing Space 1, Space 2, and Space 3 must either reject the request without disclosure or return only the authorized subset according to a documented server contract. It must never return Space 3 metadata.

If the provider cannot prove `all_accessible`, that capability remains false and the UI must not present "My Accessible KnowHub Knowledge".

### Deduplication and provenance

The replicated canonical document must collapse to one selected `ContextHit` using provider/document identity or content hash. The two unrelated same-title documents must remain distinct. The selected hit retains its original provenance; deduplication must not synthesize a space, knowledge base, document ID, version, or authorization basis.

### Revocation and fetch

After search returns a source, revoke User A's permission before `fetch`. Fetch must fail authorization and no cached body may enter prompt context. A new search after revocation must omit the source. Required context resolves to `needs_context`; optional context may continue only with an explicit structured warning.

### Freshness, snapshot, and restart

Real version/update metadata must survive `ContextHit` to `ContextSnapshot`, evidence, and Review without mutation. Missing provider freshness stays null. The persisted snapshot contains bounded/redacted snippets, hashes, stable references, query, purpose, retrieval time, and provenance rather than whole documents.

After an AionCore restart, the snapshot and its Plan/Run links must remain reviewable with the same hash and provenance.

### Policy and strict planning

Planning access must enter through the trusted `knowledge_read` policy path. The provider is allowed only when it declares and proves `permission_aware` plus `provenance`, and the invoked operation is classified as read-only by trusted registration.

Strict planning must remain `GUARANTEED`. Unknown tools, generic MCP tools, mutable operations, missing capability declarations, and untrusted registrations must be denied. A tool name or description containing "search" is not proof of read-only behavior.

### Redaction and non-disclosure

Automated checks must scan persisted rows, API responses, workflow logs, uploaded artifacts, and packaged-app diagnostics for:

```text
Authorization headers
cookies
access and refresh tokens
MCP credentials
Space 3 marker text or identifiers in User A results
```

The test fails on any match. Error messages must distinguish `context unavailable` from agent execution failure without revealing inaccessible resource details.

## Packaged E2E gate

The final M5 gate must exercise:

```text
Packaged WorkMate
  -> released AionCore
  -> real authenticated KnowHub
  -> all-accessible permission-filtered search
  -> ContextSnapshot
  -> strict Plan artifact linked to that snapshot
  -> Knowledge Evidence in Review
  -> hash-bound approval
  -> execution and verification
```

Mocks and neutral provider contract tests remain useful lower-level checks but cannot satisfy this gate. The run record must identify the WorkMate build, released AionCore version, KnowHub environment/contract version, non-secret fixture revision, GitHub Actions run, and final result.

## Evidence required to enable production

Before enabling the adapter or UI, the implementation report must link to:

- the real request/response contract and capability mapping;
- the authenticated subject and tenant mapping design;
- server-side permission enforcement documentation;
- passing provider integration tests for every advertised capability;
- negative leakage, revocation, deduplication, provenance, and redaction results;
- strict-planning policy evidence;
- restart persistence evidence;
- the passing packaged E2E run against released AionCore and real KnowHub.

Until all applicable evidence exists, the production verdict remains `BLOCKED / UNVERIFIED`, and M5 remains open.
