# KnowHub capability audit

## Executive finding

No real KnowHub MCP server, API client, schema, endpoint contract, deployment configuration or test fixture exists in the audited WorkMate, AionCore or `aionrs` source. No auditable `suoak` or `iOfficeAI` GitHub repository was discoverable by repository search on 2026-10-06.

The only KnowHub-specific code is the Agent Center metadata shape:

```text
KnowledgeScopeRef {
  knowhub_space_id
  node_ids?
  access = "read"
}
```

It is serialized in `assistant_agent_center.knowledge_scopes` and mirrored in WorkMate types, but no runtime code reads it. It is not evidence that a space exists, that the current user may access it, or that KnowHub supports search at that scope.

Accordingly, this audit records unknowns as **UNVERIFIED**, not as supported capabilities. M5 must not present `My Accessible Knowledge`, multi-space search or provenance until a real provider contract passes integration tests.

## Capability verdict

| Question                                                     | Current verified answer                  | Evidence                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Is current KnowHub access tenant-bound or single-space?      | **UNVERIFIED**                           | No KnowHub client/server contract is present                                                       |
| Can the current user enumerate accessible spaces?            | **UNVERIFIED / unavailable in WorkMate** | Generic MCP `tools/list` discovers tools, not user-authorized spaces                               |
| Can KnowHub search one explicit space?                       | **UNVERIFIED**                           | `KnowledgeScopeRef` is storage-only and has no execution path                                      |
| Can KnowHub search multiple explicit spaces atomically?      | **UNVERIFIED**                           | No request/response schema exists                                                                  |
| Can KnowHub search all knowledge accessible to the caller?   | **UNVERIFIED**                           | No `all_accessible` or equivalent server endpoint exists in the audited source                     |
| Does every result carry tenant/space/KB/document provenance? | **UNVERIFIED**                           | No KnowHub result type exists                                                                      |
| Does every result carry version or `updated_at`?             | **UNVERIFIED**                           | No freshness contract exists                                                                       |
| Where is permission enforcement performed?                   | **UNVERIFIED**                           | Core scopes MCP configuration by local user, but that does not prove remote document authorization |
| How is MCP token identity mapped to the WorkMate user?       | **UNVERIFIED**                           | OAuth is stored per Core user/server URL; KnowHub subject/tenant mapping is not exposed            |
| Are KnowHub tools provably read-only?                        | **NO in the current integration**        | MCP tool metadata contains only name, description and input schema                                 |

## What the existing MCP stack actually proves

The current MCP stack can:

- persist server definitions per Core user;
- use stdio, legacy SSE and Streamable HTTP transports;
- hold transport environment variables or headers;
- perform OAuth status/login/logout for URL transports;
- connect and persist `tools/list` output;
- inject selected or enabled servers into agent sessions;
- freeze selected MCP IDs in conversation/session configuration;
- deny untrusted or unknown MCP capability metadata in planning policy.

It does **not** currently prove:

- remote tenant, space, knowledge-base or document authorization;
- a server-side all-accessible aggregation query;
- canonical document IDs or duplicate identity across spaces;
- result-level permission scope or provenance;
- freshness/version semantics;
- content-fetch authorization distinct from search authorization;
- read-only behavior for an arbitrary discovered tool;
- that the authenticated MCP subject is the same enterprise subject represented by the WorkMate user.

Transport authentication is necessary but is not an authorization model.

## Required provider contract

The preferred KnowHub capability is a server-side, permission-filtered operation equivalent to:

```text
search_my_accessible_knowledge(query, limit, filters, cursor?)
```

The name is not normative. The semantics are:

1. derive the enterprise subject from the authenticated request;
2. determine every space/KB/document that subject may read on the server;
3. search only that authorized set;
4. return result-level canonical provenance and permission scope;
5. never reveal inaccessible identifiers, counts, titles or snippets;
6. apply provider-native retrieval/reranking;
7. return stable pagination and bounded results.

If the real KnowHub architecture offers a different aggregate API, the adapter may map it to the same semantics. WorkMate must not enumerate guessed space IDs or union per-space results unless the server first returns an authoritative accessible-scope list and every search call rechecks authorization.

## Minimum request semantics

A usable v1 contract must support or explicitly reject:

```text
subject identity (derived, not trusted from a UI field)
scope:
  single_scope(space)
  multi_scope(spaces)
  all_accessible
query
limit / cursor
filters
purpose: planning | execution | verification
```

Client-supplied tenant/user/space IDs are selectors only. They cannot grant access.

## Minimum result provenance

Every hit that can influence an agent decision must supply enough stable data to create M4 evidence:

```text
provider
canonical_source_id
tenant_id or nullable when the provider truly has none
space_id + space display name
knowledge_base_id + display name
document_id + title
bounded snippet or a separately authorized fetch reference
score
permission_scope / authorization basis
document_version or updated_at (nullable only when unavailable)
retrieved_at
provider provenance payload/version
```

WorkMate may add its own retrieval timestamp and content hash. It must not invent provider version, permission or provenance values.

## Identity and authorization requirements

Before enabling a KnowHub provider, the real integration must document and test:

- which WorkMate/Core user obtains the MCP or API credential;
- which KnowHub tenant and subject that credential represents;
- whether credentials are user-delegated, service-account or on-behalf-of;
- token audience, expiry, refresh and revocation behavior;
- where space/KB/document permission checks occur;
- whether search and fetch use the same authorization rules;
- how a deactivated user or revoked space permission invalidates cached context;
- which non-secret authorization explanation may be persisted as evidence.

The provider must derive identity from authenticated server state. A `user_id`, tenant ID or space ID sent by the renderer must never be accepted as authorization proof.

## Strict-planning policy gate

Aion strict planning is currently `GUARANTEED` because only an exact read-only built-in allowlist is registered and all other tools fail closed. Generic MCP processes are disabled in that strict profile.

KnowHub may enter strict planning only when all of the following are true:

- the adapter is registered through the mandatory policy gateway;
- the operation has trusted, server-owned `knowledge.read` / `mcp.read` classification;
- no upload/create/update/delete side effect is reachable through the same call;
- unknown operations and missing capability declarations are denied;
- network destination and provider identity are fixed/audited;
- query, result use and policy decision are traced without credentials;
- runtime capability reporting still resolves to `GUARANTEED`.

Tool naming, a description containing “search”, or an input schema without mutation fields is not sufficient proof. Until the gate is met, strict planning must deny KnowHub access rather than downgrade isolation.

## Cross-space acceptance contract

The M5 acceptance fixture must represent:

```text
User A:
  authorized: Space 1, Space 2
  unauthorized: Space 3
```

For one cross-space topic, the server/provider must return authorized results from Space 1 and Space 2, return no content or metadata from Space 3, and attach space/KB/document provenance to every hit. Tests must also cover:

- two copies of one canonical document deduplicated by provider/document ID or content hash, never title alone;
- permission revocation between two searches;
- a search result whose later content fetch is no longer authorized;
- absent version metadata remaining null rather than fabricated;
- credentials and authorization headers absent from trace/evidence;
- required context failing closed as `needs_context`;
- optional context continuing with an explicit warning;
- restart retaining the context snapshot and its provenance.

## Decision and blocker

M5 can now design and implement the provider-neutral `ContextProvider`, query/result/snapshot contracts, persistence, policy seam and test doubles. A production `KnowHubContextProvider` and real packaged KnowHub E2E remain blocked until the actual KnowHub MCP/API contract and an authorized test environment are available.

This is a capability blocker, not permission to approximate `all_accessible` in the renderer or to claim multi-space support from the existing `knowledge_scopes` array.
