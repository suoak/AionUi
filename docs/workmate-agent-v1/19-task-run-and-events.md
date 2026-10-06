# Task run and trace events

## Run model

M4 extends the existing `task_runs` table. It remains the sole identity for one concrete planning or execution attempt; no parallel ExecutionRun aggregate was introduced.

The run now records `run_kind`, agent id/runtime/model, task mode, planning-isolation level, immutable plan/goal and approval links, start/end/status, bounded result/error summaries, nullable provider usage, and the next trace sequence. Planning runs may exist before a plan artifact or approval does, so those two links are nullable for `run_kind = planning`.

## Persistent trace projection

`task_trace_events` is a run-scoped projection of facts already produced by the TaskSession repository and Conversation stream. Each row contains:

```text
event_id
task_session_id
run_id
sequence
timestamp
event_type
bounded redacted payload
```

The unique `(run_id, sequence)` constraint is backed by an atomic database allocation: an append increments `task_runs.next_trace_sequence` with `UPDATE ... RETURNING` and inserts the event in the same transaction. Review ordering never depends on timestamp precision. A multi-connection test appends 24 events concurrently, asserts a continuous unique sequence, closes the database, reopens it, and verifies the same trace.

## Event sources

Repository transactions project task, run, planning, artifact, approval, verification and terminal facts. A task-aware observer on the existing Conversation stream projects real tool lifecycle and ACP diff events. It does not create a second event bus and does not re-evaluate policy later.

The implemented vocabulary includes:

```text
task.created
run.started / run.completed / run.failed / run.cancelled / run.interrupted
planning.started / planning.completed
tool.requested / tool.allowed / tool.denied
tool.started / tool.completed / tool.failed
approval.requested / approval.approved / approval.rejected
artifact.created
file.changed
verification.started / verification.completed
criterion.passed / criterion.failed / criterion.needs_verification
```

Checkpoint creation is represented by its durable checkpoint row and sequence rather than duplicating large checkpoint state into an event payload.

## Consistency and enforcement

Artifact plus approval creation, approval resolution, execution claim plus initial trace, planning completion, verification updates, terminal run updates, and restart interruption are transactional. Policy facts are persisted from the decision taken at enforcement time. A trace failure is returned and logged; it cannot convert `DENY` to `ALLOW` or bypass the M2 execution claim.

Tool display telemetry is observed from the canonical stream, but every security decision used by Review is persisted as a policy evidence row. On restart, existing rows remain intact and a formerly running run receives `run.interrupted` rather than a false completion.

## Compatibility

Migration 062 rebuilds the old execution-only `task_runs` shape while preserving its rows and foreign-key relationships, then adds trace/checkpoint/evidence tables and indexes. Migration coverage proves an M2 execution remains readable and that a planning run can be added afterward.
