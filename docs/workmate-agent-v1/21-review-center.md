# Review Center

## Authoritative API

The renderer does not query or join SQLite. AionCore exposes owner-scoped endpoints beneath a task and run:

```text
GET /api/task-sessions/{task_id}/runs/{run_id}/review
GET /api/task-sessions/{task_id}/runs/{run_id}/trace
GET /api/task-sessions/{task_id}/runs/{run_id}/changes
GET /api/task-sessions/{task_id}/runs/{run_id}/approvals
GET /api/task-sessions/{task_id}/runs/{run_id}/verification
```

The aggregate review returns the task, exact run, related immutable artifacts and approvals, acceptance criteria, ordered trace, checkpoints, evidence and a computed summary. Artifact/approval/criterion collections are filtered to the selected run rather than returning unrelated historical versions. Response JSON is sanitized again at the API boundary.

The existing owner-scoped endpoint below resolves retained diff references:

```text
GET /api/conversations/{conversation_id}/outputs/{reference}
```

## Renderer

The Conversation page adds a small Review action without restructuring chat. It opens a run selector and six tabs:

- Overview: task/run status, mode, agent/runtime/model, isolation, timing, plan/goal link, nullable usage and result.
- Changes: path, change type, added/deleted counts, and click-to-load retained diff; an empty planning run explicitly reports no workspace changes.
- Tools: backend sequence, lifecycle event, tool and capability.
- Policy: persisted ALLOW/DENY decision, capability, tool and reason, with DENY visually prominent.
- Approvals: type, status, exact artifact SHA-256, request/resolve time and resolver.
- Verification: each criterion status plus its run-scoped evidence.

Failed and cancelled runs use the same selector and review response as completed runs. The UI contains no success-only filter.

All new visible copy uses the `conversation.taskSession.review` namespace. Keys exist in every language declared by `i18n-config.json`, generated key types are current, and the i18n validator passes.

## UI verification

The focused DOM test supplies an authoritative review with a file change, ALLOW decision, exact approval hash and command verification evidence. It asserts all six sections render and verifies that clicking View diff calls the retained-output API with the selected conversation and reference before showing the full diff.
