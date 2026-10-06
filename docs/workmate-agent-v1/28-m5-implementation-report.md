# M5 implementation report

## Status

```text
M5 = PARTIAL / OPEN
```

The provider-neutral enterprise-context foundation, durable evidence seam, and deterministic source resolver are implemented and merged. Production KnowHub access is not implemented because no real KnowHub MCP/API contract, authenticated identity mapping, permission model, or authorized integration environment is available in the audited repositories.

This report does not convert neutral contract tests into a KnowHub capability claim. M5 cannot be closed until the real provider and packaged E2E gate pass.

## Merged baseline

| Repository | Change                                                                                             | Merge commit | Cloud evidence                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AionCore   | Provider-neutral context, policy, snapshot, evidence, Review, and persistence foundation (PR #134) | `205dea9e`   | [CI run 37484245909](https://github.com/suoak/AionCore/actions/runs/37484245909), [Native Presentation run 37484246039](https://github.com/suoak/AionCore/actions/runs/37484246039) |
| AionCore   | Deterministic Context Resolver with explicit required/optional provider semantics (PR #135)        | `034bcdfa`   | [CI run 37491188894](https://github.com/suoak/AionCore/actions/runs/37491188894), [Native Presentation run 37491188658](https://github.com/suoak/AionCore/actions/runs/37491188658) |
| WorkMate   | M5 baseline, KnowHub audit, provider contract, and snapshot/evidence design (PR #157)              | `43da4cc0b`  | Repository PR and Push checks passed before merge                                                                                                                                   |
| WorkMate   | Cross-space security and packaged E2E acceptance contract (PR #158)                                | `397eca549`  | [PR checks 37496453348](https://github.com/suoak/AionUi/actions/runs/37496453348), [Push checks 37496445681](https://github.com/suoak/AionUi/actions/runs/37496445681)              |

The M4.5 release baseline remains AionCore `v0.2.15`. The M5 Core commits above are newer than that release and are not yet a released packaged dependency.

## Implementation matrix

| Closure criterion                                    | Status                                        | Evidence or blocker                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextProvider` abstraction                        | **IMPLEMENTED**                               | Provider identity, capabilities, discovery, search, fetch, authorization, and provenance contracts are merged in AionCore                                             |
| Unified query/result model                           | **IMPLEMENTED**                               | Purpose-aware `ContextQuery`, scope variants, provenance-rich hits, freshness, and authorization data are shared API types                                            |
| Policy enforcement                                   | **IMPLEMENTED for neutral providers**         | Trusted `knowledge_read` classification enters the M3 planning policy; unknown, untrusted, or incomplete providers fail closed                                        |
| Deduplication and Context Budget                     | **IMPLEMENTED**                               | Canonical document/content/source keys, bounded hit count, Unicode snippet limit, and total snippet budget are tested                                                 |
| Deterministic Context Resolver                       | **IMPLEMENTED as a library seam**             | Explicit provider selection, discovery ordering, source deduplication, recommendation budget, and user-confirmation flags are merged                                  |
| Required/optional failure semantics                  | **PARTIAL**                                   | Required provider discovery fails closed and optional discovery emits structured warnings; TaskSession has not yet exposed a distinct `needs_context` lifecycle state |
| Context Snapshot persistence                         | **IMPLEMENTED**                               | Migration 063 stores bounded snapshot references and artifact links with TaskSession ownership constraints                                                            |
| Plan/Run context linkage                             | **PARTIAL**                                   | Snapshot-to-run and snapshot-to-artifact storage exists; automatic planning has not yet invoked resolver/search and attached the snapshot                             |
| Knowledge Evidence and Trace                         | **IMPLEMENTED as a controlled seam**          | `context.used` trace plus `knowledge` evidence are recorded by the controlled snapshot service path with redaction                                                    |
| Review API visibility                                | **IMPLEMENTED at API level**                  | Review aggregation returns context snapshots and linked evidence after restart                                                                                        |
| WorkMate Review rendering                            | **NOT IMPLEMENTED**                           | No Context/Evidence renderer consumes the new Review fields yet                                                                                                       |
| Strict Planning safety                               | **PRESERVED for implemented paths**           | `knowledge_read` requires trusted, permission-aware, provenance-capable registration; generic/unknown MCP tools remain denied                                         |
| Credential redaction                                 | **IMPLEMENTED for neutral persistence paths** | Snapshot, trace, evidence, and Review metadata use the M4 sanitizer; a real KnowHub transport still requires leakage tests                                            |
| Restart persistence                                  | **IMPLEMENTED**                               | Snapshot and artifact-link repository tests verify durable reload and ownership isolation                                                                             |
| KnowHub provider                                     | **BLOCKED / NOT IMPLEMENTED**                 | Real transport, contract, subject mapping, authorization behavior, and capability truth are absent                                                                    |
| Permission-aware KnowHub retrieval                   | **BLOCKED / UNVERIFIED**                      | No server-side permission contract or authorized fixture exists                                                                                                       |
| Single-, multi-, or all-accessible scope             | **BLOCKED / UNVERIFIED**                      | The neutral API can express these scopes; no production capability may be advertised                                                                                  |
| Cross-space aggregation                              | **BLOCKED / UNVERIFIED**                      | Acceptance contract exists in `27-knowhub-cross-space.md`; no real provider run exists                                                                                |
| Packaged WorkMate + released Core + real KnowHub E2E | **BLOCKED / NOT RUN**                         | M5 Core is unreleased and no real KnowHub environment is available                                                                                                    |

## Implemented runtime flow

The audited provider-neutral path is:

```text
trusted provider registration
  -> deterministic source discovery
  -> user confirmation required
  -> knowledge_read planning policy
  -> capability and query validation
  -> provider-native search
  -> per-hit provenance validation
  -> per-hit authorization recheck
  -> canonical deduplication
  -> Context Budget
  -> ContextSnapshot
  -> context.used Trace + knowledge Evidence
  -> Review API
```

The individual resolver, search, persistence, trace, evidence, and review components are implemented. The end-to-end orchestration from `start_automatic_planning` through provider selection, query injection, snapshot creation, and artifact linkage is not yet connected.

## KnowHub capability verdict

| Capability                                   | Production verdict |
| -------------------------------------------- | ------------------ |
| authenticated identity mapping               | UNVERIFIED         |
| single-scope search                          | UNVERIFIED         |
| multi-scope search                           | UNVERIFIED         |
| all-accessible search                        | UNVERIFIED         |
| permission-aware search                      | UNVERIFIED         |
| permission-aware fetch                       | UNVERIFIED         |
| result-level provenance                      | UNVERIFIED         |
| freshness/version metadata                   | UNVERIFIED         |
| provably read-only strict-planning operation | UNVERIFIED         |

`KnowledgeScopeRef` remains dormant configuration metadata. It does not prove existence, access, search capability, or authorization. WorkMate must not show "My Accessible KnowHub Knowledge" or infer a client-side space union from it.

## Cross-space and permission model

The required production behavior is specified in `27-knowhub-cross-space.md`. In summary, the server must derive the enterprise subject from authenticated state, compute the readable corpus server-side, return only authorized results, and attach canonical space/knowledge-base/document provenance to every hit.

For User A with Space 1 and Space 2 access but no Space 3 access, one cross-space query must return Space 1 plus Space 2 and disclose nothing about Space 3. Revocation between search and fetch must be enforced. Client-side guessing, configured-space crawling, or filtering unauthorized results after retrieval is not acceptable.

## Planning and execution safety

The neutral foundation preserves the M3 strict-planning guarantee:

- trusted `knowledge_read` is the only new planning capability;
- provider declarations must include `permission_aware` and `provenance`;
- scope support is validated before search;
- every returned hit is reauthorized and checked against provider provenance;
- generic MCP discovery does not create trusted capability metadata;
- unknown or mutable MCP tools remain denied;
- full enterprise documents are not copied into snapshots by default.

Execution-time context and material-change handling remain incomplete. New context may not silently alter an approved immutable Plan. A material change must create a new Plan artifact and require hash-bound re-approval before execution follows the changed path.

## Known limitations and blockers

The next production implementation cannot proceed safely without all of the following external inputs:

1. the real KnowHub MCP/API request and response contract;
2. authenticated WorkMate/Core user to KnowHub subject and tenant mapping;
3. documented search and fetch authorization enforcement;
4. authoritative support declarations for single, multi, and all-accessible scopes;
5. canonical result provenance and freshness semantics;
6. a provably read-only operation suitable for strict planning;
7. an authorized cross-space integration fixture and CI secret strategy.

Once those inputs exist, the in-scope implementation order is:

1. implement and contract-test `KnowHubContextProvider` against the real service;
2. register it through trusted policy metadata without enabling writes;
3. connect confirmed resolver output to automatic planning and create a snapshot before context influences the Plan;
4. expose an explicit `needs_context` outcome for required provider failure and trace optional warnings;
5. render Context/Evidence in the existing Review Center;
6. release an AionCore version containing the M5 runtime;
7. run the packaged WorkMate + released Core + real KnowHub acceptance scenario.

## Closure decision

M5 remains open. The merged neutral foundation is usable for continued integration work, but the defining product claim—enterprise knowledge-grounded execution against real, permission-filtered KnowHub data—has not been demonstrated.

No Agent Router, Enterprise Workflow, native OAuth, full RBAC, analytics, Skill Evolution, KnowHub write path, or automatic knowledge deposition was introduced.
