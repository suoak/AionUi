# M4 execution trace baseline

## Audited baseline

This audit is against WorkMate `4bf610432` and AionCore `b81c4ff5` (`v0.2.14`). It records the pre-M4 state before any trace or review implementation.

## Existing task execution aggregate

The existing TaskSession aggregate is authoritative and must be extended rather than duplicated.

| Concept            | Persisted model            | Reusable fields and invariants                                                                  | M4 gap                                                    |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Task               | `task_sessions`            | owner, project/conversation binding, mode, objective, status, agent type, timestamps            | no review projection or current run relation              |
| Immutable contract | `task_artifacts`           | kind, version, immutable content, SHA-256 hash, status                                          | artifact lifecycle is not projected as trace events       |
| Approval           | `task_approvals`           | artifact id/hash, status, requester/resolver timestamps, resolver, comment, claimed `run_id`    | approval lifecycle is not projected as trace events       |
| Execution          | `task_runs`                | unique run id, task/conversation, plan/goal artifact ids, approval id, status, start/end, error | lacks runtime/model/isolation, result summary and usage   |
| Goal verification  | `task_acceptance_criteria` | ordered criterion, status, bounded structured evidence, verification timestamp                  | evidence is task-scoped rather than explicitly run-scoped |

`task_runs` already represents one concrete execution of an approved immutable plan. Its creation atomically claims the matching approval and changes the TaskSession to `running`. M4 therefore extends `task_runs`; it must not introduce a second `ExecutionRun` or `TaskRun` aggregate.

## Existing event and evidence mechanisms

### Canonical conversation journal

The Conversation runtime already writes a canonical append-only JSONL journal. Each event has an event id, conversation id, backend-assigned sequence, timestamp, kind and payload. Append cursors serialize writes, reject duplicate event ids and maintain an index. The journal survives process restart and supports deterministic replay.

This is the source stream for agent/tool activity. It is not by itself a Task Review:

- it is scoped by conversation rather than task/run;
- it has no task id or run id;
- ordinary conversations can share the same conversation history;
- policy, immutable artifact and hash-bound task approval facts are stored elsewhere;
- renderer message cards are projections and cannot be treated as authoritative audit rows.

M4 should attach a task/run context to the existing stream and persist a bounded task trace projection. It must not create another event bus.

### Conversation messages and renderer state

Tool-call cards and diffs are persisted in `messages` and rendered from Conversation state. They can supply tool and diff evidence, but their ordering is conversation-message ordering, their schema is provider-specific, and they do not prove a task-run association. Transient SWR/modal state in `ChatConversation.tsx` is reconstructed from backend APIs and is lost on reload; it is not evidence.

### Usage ledger

`usage_events` persists provider-reported token and cost deltas by conversation/turn. Values are incomplete across providers by design. M4 may aggregate events belonging to a run, but must keep unknown values nullable and must not invent cost.

### Output retention and diff rendering

The Conversation stream already bounds inline tool output and spills oversized output to content-addressed files. WorkMate already renders unified diffs from tool-call content. M4 should store summaries plus references and reuse the existing diff viewer; it must not put unbounded stdout, model output or complete file contents into SQLite and must not implement a second Git engine.

## Policy baseline

M3 has typed `ALLOW`, `ASK` and `DENY` decisions and an Aion strict-planning policy. Decisions are currently emitted through structured tracing logs, not persisted as Task Review data. Strict planning uses a mandatory runtime gateway for the guaranteed Aion profile; other runtimes remain fail-closed for automatic planning.

M4 must persist the decision produced at enforcement time. It must never reconstruct historical policy by running the current policy again. Trace write failure must not turn a denied action into an allowed action or bypass the execution gate.

## Restart behavior

On startup, `running`/`waiting_approval` TaskSessions and `running` task runs are changed to `paused`; no agent turn or tool call is replayed. Existing task, artifact, approval, run and acceptance rows survive restart. Canonical conversation journals also survive restart. What is missing is a durable `run.interrupted` trace and durable run-scoped checkpoints/evidence.

## Consistency classification

The following facts are security-critical and require the repository's transaction boundary or an equivalent strongly consistent write:

- artifact creation and approval request;
- approval resolution and its exact artifact hash;
- execution claim and `run.started`;
- persisted policy decision before an allowed execution continues, or a fail-closed error;
- terminal run state and terminal run event;
- restart interruption state and event.

Low-risk presentation telemetry may remain best effort, but it must be labelled as such and cannot be used as proof that a policy or approval gate ran.

## Required M4 extension

The minimum compatible extension is:

1. Extend `task_runs` with agent/runtime/model, mode/isolation, result summary and nullable usage metadata.
2. Add a run-scoped `task_trace_events` projection with a database-allocated unique sequence.
3. Add `task_checkpoints` for recovery/audit positions; checkpoints are not Git commits.
4. Add bounded `task_evidence` references for tool, command, file, diff, artifact, test, policy, approval and user evidence, while reserving `mcp` and `knowledge` kinds.
5. Project existing artifact, approval, run, policy, tool, file-change and verification facts into those stores.
6. Expose backend-owned review endpoints; the renderer must not join SQLite data itself.

## Secret and size boundary

All trace payloads and summaries must pass through one backend redaction and bounding function before persistence. It must cover authorization headers, bearer tokens, API keys, passwords, cookies, access tokens and refresh tokens. Unknown structured payloads are stored as an allowlisted summary or omitted, never persisted wholesale by default.

## Explicit non-goals

M4 does not add KnowHub context, an Agent Router, Enterprise Workflow, native OAuth, full RBAC/DLP, analytics dashboards, Skill Evolution features or a plugin marketplace. It also does not reopen the M2 approval or M3 planning-isolation design unless implementation tests reveal a concrete defect.
