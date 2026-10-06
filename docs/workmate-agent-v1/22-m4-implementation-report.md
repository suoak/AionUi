# M4 implementation report

## Status

```text
M0   = CLOSED
M1   = CLOSED
M1.5 = CLOSED
M2   = CLOSED
M3   = CLOSED
M4   = CLOSED
```

M4 implementation and its packaged Review release gate are complete in the local feature branches.

## Final data model

M4 reuses `task_sessions`, immutable `task_artifacts`, hash-bound `task_approvals`, `task_runs`, acceptance criteria, the canonical Conversation stream and retained-output storage. It extends `task_runs` and adds only `task_trace_events`, `task_checkpoints` and `task_evidence`.

See [18-m4-trace-baseline.md](18-m4-trace-baseline.md), [19-task-run-and-events.md](19-task-run-and-events.md), [20-checkpoint-and-evidence.md](20-checkpoint-and-evidence.md), and [21-review-center.md](21-review-center.md).

## Consistency, checkpoint and evidence strategy

- Database-allocated run sequence plus a unique constraint provides concurrent deterministic ordering.
- Security-critical artifact, approval, claim, verification, terminal and interruption projections share repository transactions with their source state.
- Policy Review stores the decision made on the real enforcement path; historical policy is never re-run.
- Checkpoints mark plan submission, execution claim, mutation, verification and completion boundaries without creating Git commits.
- Large diff bodies reuse content-addressed output retention; SQLite stores a redacted bounded reference.
- Usage is captured from the existing adapter snapshot when available and remains nullable.

## Secret redaction

One backend strategy recursively sanitizes trace/event/evidence JSON and bounded summaries. Authorization, Bearer, API key, token, password, cookie, access token and refresh token patterns are replaced before SQLite or retained-output writes. Unknown payloads are summarized instead of being persisted wholesale.

## Review API and UI

AionCore provides aggregate and focused trace/changes/approvals/verification endpoints. WorkMate adds a run-selectable Review modal with Overview, Changes, Tools, Policy, Approvals and Verification tabs. It retrieves the complete diff only after user action through the existing authorized output endpoint.

## Verification recorded so far

| Check                                            | Result                       |
| ------------------------------------------------ | ---------------------------- |
| AionCore `cargo check -p aionui-app`             | Passed                       |
| Failed/cancelled terminal review repository test | Passed                       |
| File/policy/redaction/checkpoint trace tests     | Passed: 2                    |
| Successful Goal execution Review integration     | Passed                       |
| Concurrent 24-writer sequence plus reopen test   | Passed earlier in the M4 run |
| Migration 062 compatibility tests                | Passed earlier in the M4 run |
| WorkMate TypeScript `tsc --noEmit`               | Passed                       |
| Changed-file oxlint                              | Passed, 0 warnings/errors    |
| Review Center DOM/diff retrieval test            | Passed                       |
| 13-locale i18n structure and generated key sync  | Passed                       |
| Windows x64 release build with local AionCore    | Passed                       |
| Packaged strict planning + M4 Review E2E         | Passed: 1                    |
| Packaged AionCore SHA-256                        | `CED9D8330A9BEDB54C52DB686406538364AECB757D398C49A8CB961A3680E79F` |

The packaged E2E verifies a completed planning run, approval/hash binding, an execution run with a real read-only tool ALLOW decision, aggregate Review retrieval, Review modal navigation, fail-closed mutation and unknown-tool planning, and persistence of a restart-interrupted planning run as `paused` with `run.interrupted` trace evidence.

Repository-wide CI remains a remote follow-up. Local `cargo clippy --all-targets -- -D warnings` is blocked by pre-existing `type_complexity` warnings in unrelated AionCore test targets; the M4 library targets pass strict clippy.

## Known limitations

- Provider usage differs by adapter; missing tokens/cost remain null and no cost is inferred.
- Tool duration is limited by lifecycle data actually emitted by the provider.
- Checkpoints are audit/recovery markers, not automatic rollback or workspace snapshots.
- Team turns retain their existing two-state terminal compatibility at the Team adapter boundary; TaskSession Review preserves the richer failed/cancelled run state.
- M4 does not add analytics, KnowHub, Agent Router, Enterprise Workflow, native OAuth, full RBAC/DLP, Skill Evolution features or a marketplace.
