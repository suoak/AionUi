# Checkpoint and evidence model

## Checkpoints

`task_checkpoints` records important recovery and audit positions; it is not a Git commit or a workspace time-travel system. A checkpoint has a run-local sequence, type, optional artifact id, bounded state and creation time.

M4 writes the following positions:

| Type                  | Meaning                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `plan_submitted`      | immutable automatic plan and approval request were created       |
| `before_execution`    | the exact approved artifact hash was claimed                     |
| `after_mutation`      | a file change, hashes and retained diff reference were persisted |
| `before_verification` | acceptance verification is about to be recorded                  |
| `before_completion`   | terminal result/error and status are durable                     |

These positions make a run auditable and allow a future continuation strategy to identify the last durable boundary. M4 does not promise automatic rollback or complete workspace snapshots.

## Evidence references

`task_evidence` is the uniform run-scoped evidence envelope:

```text
id, task_session_id, run_id
trace_event_id?, criterion_id?
kind, summary, reference?, metadata, created_at
```

The first version accepts tool, command, file, diff, artifact, test, policy, approval and user evidence. `mcp` and `knowledge` remain reserved for future work; M4 does not implement KnowHub.

File evidence contains path, added/modified/deleted, before/after SHA-256, and added/deleted line counts. The complete redacted unified diff is written through the existing content-addressed Conversation output-retention store. SQLite keeps only a bounded preview/hash/size/reference, and the existing authorized retained-output API serves the full diff on demand.

Acceptance-criterion updates create verification lifecycle events and run-scoped evidence. Command, test, file, artifact and user confirmation inputs are mapped without reducing verification to a final PASS badge.

## Redaction and size control

All JSON, summaries and retained diffs use the same backend redaction path before persistence. It covers Authorization/Bearer values, API keys, generic tokens, passwords, cookies, access tokens and refresh tokens. Structured payloads are recursively bounded by depth, collection size and string length.

Large shell/model/file bodies are never copied wholesale into trace rows. Review stores summaries plus references. Tests assert that secrets are absent from trace rows, evidence metadata and the recovered retained diff.
