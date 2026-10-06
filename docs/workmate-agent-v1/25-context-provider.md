# ContextProvider contract

## Status

The provider-neutral M5 foundation was merged into AionCore `main` by PR #134 at commit `205dea9e`. It does not claim that KnowHub is available. A production `KnowHubContextProvider` remains blocked by the missing MCP/API contract and authorized integration environment documented in `24-knowhub-capability-audit.md`.

The contract keeps the Agent runtime independent from KnowHub and leaves room for later `WorkspaceContextProvider`, `GitContextProvider`, Jira, OA, and test-platform adapters.

## Shared contract

`ContextProvider` exposes:

```text
identity()
capabilities()
discover(request)
search(query)
fetch(request)
authorize(request)
provenance(hit)
```

The shared API types include:

- `ContextProviderIdentity`: provider name, stable instance ID, and display name;
- `ContextProviderCapabilities`: `single_scope`, `multi_scope`, `all_accessible`, `provenance`, `permission_aware`, `freshness`, and `content_fetch`;
- `ContextQuery`: task, optional project, query text, scope, result limit, filters, and purpose;
- `ContextScope`: one explicit scope, several explicit scopes, or all knowledge accessible to the authenticated subject;
- `ContextPurpose`: planning, execution, or verification;
- `ContextHit`: canonical source identity, bounded snippet, provider score, permission scope, freshness, content hash, and provenance;
- discovery, fetch, authorization, document, and snapshot types.

Provider-specific request or response payloads must be translated at the adapter boundary. Agent code must not construct KnowHub-specific payloads.

## Mandatory query path

Planning queries use the audited entry point rather than calling `ContextProvider.search` directly:

```text
trusted provider registration
  -> capability classification as knowledge_read
  -> M3 PlanningPolicy
  -> capability/scope/query validation
  -> provider search
  -> per-hit provenance validation
  -> per-hit authorization recheck
  -> canonical deduplication
  -> Context Budget
  -> snapshot / trace / evidence
```

`knowledge_read` is allowed during planning only when the adapter registration is trusted and the provider declares both `permission_aware` and `provenance`. Missing trust, missing declarations, unknown capability, mutable MCP metadata, or a policy denial fails closed.

Generic MCP discovery remains transport metadata, not trusted knowledge classification. A tool name or description containing `search` does not prove read-only behavior.

## Validation and authorization

The shared query entry point rejects:

- missing task ID or empty query text;
- zero or excessive limits;
- an unsupported scope kind;
- empty or duplicate multi-scope IDs;
- providers without permission-aware retrieval or provenance;
- empty provider identity or instance identity;
- hits with missing source, title, or permission scope;
- hits whose provider/source provenance does not match the registered provider;
- hits whose post-search authorization is denied or whose returned permission scope disagrees with the authorization result.

A provider returning an unauthorized hit is treated as a contract failure. The runtime does not silently retain the hit.

## Deduplication and budget

Provider-native ordering is preserved. WorkMate does not implement a second RAG ranker.

Deduplication keys are selected in this order:

1. provider plus canonical document ID;
2. provider plus content hash;
3. provider plus canonical source ID.

Titles are never deduplication keys. The selected hit retains its original tenant/space/knowledge-base/document provenance.

The initial `ContextBudget` defaults to:

```text
max_hits = 20
max_snippet_chars = 2,000
max_total_snippet_chars = 12,000
```

The query limit and budget both apply. Snippets are truncated by Unicode character count, not bytes. Full documents are not included in the snapshot path.

## KnowHub capability state

No KnowHub capability is enabled merely because the neutral contract exists. Until the real adapter proves its server-side behavior:

| Capability       | Production KnowHub state |
| ---------------- | ------------------------ |
| single scope     | UNVERIFIED               |
| multiple scopes  | UNVERIFIED               |
| all accessible   | UNVERIFIED               |
| provenance       | UNVERIFIED               |
| permission aware | UNVERIFIED               |
| freshness        | UNVERIFIED               |
| content fetch    | UNVERIFIED               |

The UI must not offer “My Accessible KnowHub Knowledge” or simulate cross-space aggregation while these remain unverified.

## Verified contract tests

The neutral tests cover unsupported scopes, duplicate scope IDs, required permission/provenance declarations, provider provenance ownership, canonical-document deduplication, per-hit and total snippet budgets, unauthorized-hit failure, and denial of untrusted providers by planning policy.

These tests validate WorkMate's contract and fail-closed behavior. They are not a substitute for the real KnowHub cross-space acceptance fixture.
