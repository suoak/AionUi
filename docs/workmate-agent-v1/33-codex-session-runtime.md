# M6.2 Codex session, thread, turn, and resume

## Status and scope

```text
M5   = PARTIAL / OPEN
M6   = OPEN
M6.1 = IMPLEMENTED / CLOUD AND PACKAGED BUILD VERIFIED / REAL AUTH ACCEPTANCE PENDING
M6.2 = IMPLEMENTED / CLOUD AND PACKAGED FIXTURE VERIFIED / REAL SESSION ACCEPTANCE PENDING
```

M6.2 makes Codex continuation identity explicit without changing Plan semantics, inventing a third Run model, or treating a Codex thread as a WorkMate task. Model discovery remains M6.3. Account-usage diagnostics remain outside this slice. M6.1's interactive OAuth acceptance does not block implementation or fixture-based packaging, but M6 cannot close without one real authenticated session and restart-resume acceptance.

The verified runtime baseline is `codex-cli 0.160.1`. Its generated protocol schema is retained at `C:\Users\suchen\aion\protocols\samples\codex-cli\0.160.1\schema-full`.

## Baseline audit answers

| #   | Question                                 | Repository answer                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What is the WorkMate authority?          | `TaskSession` is the business task and remains authoritative for objective, mode, approval, status, runs, trace, evidence, and review. A conversation is its interaction binding.                                                                                                   |
| 2   | What is the Codex continuation identity? | A Codex Thread ID is the opaque runtime continuation anchor. It is stored in the conversation's `acp_session.session_id` and projected as `TaskSession.runtime_binding.runtime_session_id`; it is never a TaskSession ID.                                                           |
| 3   | How is a thread created?                 | A fresh `SessionSpec` starts `codex app-server`, initializes it, and calls `thread/start`. The returned ID is kept in memory, but becomes a durable binding only when the first `turn/started` proves that the thread has a rollout.                                                |
| 4   | How is a thread resumed?                 | A rebuilt process calls `thread/resume` with only the persisted `threadId` and conservative startup configuration. WorkMate does not send stored messages as replacement history and does not use the schema's unstable cloud-only `history` input.                                 |
| 5   | What happens to a zero-turn thread?      | It is not advertised as durable. An exact-version probe created a thread, restarted app-server before any turn, and received `-32600 no rollout found for thread id` on resume. For `0.160.1`, zero-turn resume is therefore `VERSION_SPECIFIC / NOT_RESUMABLE`.                    |
| 6   | How do turns map to runs?                | `turn/start` is the native unit of one Codex interaction. Planning and approved execution each already own one `TaskRun`, so their Codex turn is linked into that run's Trace. Ordinary chat turns remain conversation turns and do not create a duplicate Run abstraction.         |
| 7   | How is terminal state decided?           | `turn/completed.turn.status` is authoritative: `completed`, `failed`, and `interrupted` map to completed, failed, and cancelled outcomes. Receipt of the notification alone is not success.                                                                                         |
| 8   | How does cancellation work?              | The adapter records `turn/started.turn.id` and sends `turn/interrupt {threadId, turnId}`. A duplicate cancel with no active turn is an idempotent no-op. Process kill is only the bounded timeout/restart fallback, never the first cancellation mechanism.                         |
| 9   | What survives failures and restart?      | TaskSession, conversation history, artifacts, Trace, and the Thread binding survive process/app restart. A missing Thread marks the binding `resume_failed`; WorkMate neither deletes the TaskSession nor silently starts a replacement thread or replays a possibly mutating turn. |

## Contract

### Identity and ownership

```text
TaskSession.id                 business task identity
  -> conversation_id          interaction/history binding
     -> acp_session.session_id Codex Thread continuation identity
        -> turn.id             active native operation identity
           -> TaskRun/Trace    planning or execution evidence, when applicable
```

`TaskSession.agent_session_id` is retained as a legacy client field. It is not the authoritative Codex continuation anchor. The server-owned `runtime_binding` projection contains:

- `runtime_type = codex`;
- `integration_mode = app_server`;
- opaque `runtime_session_id`;
- `state = bound | not_resumable | resume_failed | revalidation_required | unavailable | broken`;
- optional workspace, runtime version, account generation, and last-observed time.

Deleting or losing a Codex Thread must never delete its TaskSession. Clearing a failed binding is an explicit new-session action; it is not an automatic recovery side effect.

### Protocol mapping

| Codex method/event                      | WorkMate owner                     | Durable effect                                                                                              |
| --------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `thread/start` / `thread/started`       | `CodexConnection`                  | In-memory candidate only until the first turn starts                                                        |
| `thread/resume {threadId}`              | `CodexConnection`                  | Reattaches the stored continuation; never reconstructs from UI history or a path                            |
| `turn/start {threadId,input}`           | `AgentAdapter` / conversation turn | Starts one serialized operation on the thread                                                               |
| `turn/started {threadId,turn.id}`       | session pump                       | Atomically binds the first durable Thread ID and writes `runtime.turn.bound` into an attached TaskRun Trace |
| `turn/completed {threadId,turn.status}` | session pump / relay               | Settles the conversation turn and attached TaskRun according to the actual status                           |
| `turn/interrupt {threadId,turnId}`      | cancel path                        | Cancels exactly the active turn; repeated cancellation is safe                                              |

### Resume and failure rules

Native resume may be claimed only when a real Thread ID was persisted, app-server was restarted, `thread/resume` succeeded, and the next turn retained prior context. Source-level method availability alone is insufficient.

Before resume, the normal session-context builder validates the persisted workspace. A missing workspace is `WORKSPACE_UNAVAILABLE`; it is not replaced with a different directory. A missing Thread is `RUNTIME_SESSION_NOT_FOUND` and transitions the binding to `resume_failed`. Authentication failures remain `AUTH_REQUIRED`. An account identity-generation change recycles active Codex processes and requires binding revalidation before continuation is accepted.

A runtime crash fails or interrupts the active turn, preserves TaskSession and Thread identity, and never automatically replays a mutating turn. Multiple Threads may execute concurrently because they own separate connections. Commands on one connection are serialized, and only one active turn ID is eligible for interruption.

### Planning and review

Plan isolation, immutable artifacts, approval hashes, and execution policy are unchanged. The existing planning/execution `TaskRun` receives:

- `runtime.turn.bound` with the Codex turn ID;
- `runtime.session.observed` with the Thread ID on terminal settlement;
- the existing ordered tool, policy, file, checkpoint, evidence, usage, and result events.

The Review overview projects the current server-owned binding state and Thread ID. This is diagnostic evidence, not a second task lifecycle.

## Implementation

### AionCore

- `aionui-session/backend/codex_conn.rs` performs the structured start/resume/turn/interrupt mapping, retains the active turn ID, reads terminal status, and delays durable `BackendBound` until `turn/started`.
- `aionui-db/repository/acp_session.rs` and the SQLite implementation persist binding state beside the opaque continuation ID. First binding uses compare-and-set semantics: the same ID is idempotent and a competing ID yields `RUNTIME_BINDING_CONFLICT`.
- `aionui-ai-agent/session_agent.rs` marks successful bindings `bound`, marks rejected Codex resume `resume_failed`, retains the failed ID, and does not clear it into an implicit fresh session.
- `aionui-conversation/turn_recovery_policy.rs` excludes Codex from automatic turn replay even when an error is otherwise retryable.
- TaskSession API responses and run reviews project `runtime_binding`; Task Trace records native Thread/Turn references for planning and execution runs.

No migration was required: the opaque Thread ID continues to use the existing `acp_session.session_id`, while new projection metadata is merged under `session_config.runtime`.

### WorkMate

The shared TaskSession type includes the server-owned runtime binding. The Review overview shows Thread ID, binding state, and runtime version when present. It does not let the renderer manufacture or edit continuation identity.

## Tests

The required cloud suite covers:

- exact request parameters for `thread/start`, `thread/resume`, `turn/start`, and `turn/interrupt`;
- no durable binding after a zero-turn `thread/started`;
- durable binding and Turn ID after `turn/started`;
- completed, failed, and interrupted terminal statuses;
- exact-target and repeated cancellation, including cancel/start and cancel/restart races;
- Codex resume failure retaining the anchor and disabling automatic replay;
- SQLite runtime-state round trip and atomic competing first-bind behavior;
- TaskSession RuntimeBinding and Task Trace projection;
- workspace/auth/session-not-found normalization;
- UI type checking, i18n consistency, Review rendering, and packaged smoke.

The exact `0.160.1` zero-turn probe is additional compatibility evidence, not a substitute for the repository suite.

### Immutable cloud evidence

Recorded on 2026-10-07:

- AionCore PR [#137](https://github.com/suoak/AionCore/pull/137) merged as `ebcb7411d5b023fdbad2ac137b47b05b8469f103`.
- AionCore CI run [37568782056](https://github.com/suoak/AionCore/actions/runs/37568782056) passed format, check, Clippy, migration, `cargo nextest run --workspace`, and `cargo test --workspace`.
- AionCore Windows x64 manual build [37571103049](https://github.com/suoak/AionCore/actions/runs/37571103049), pinned to that merge revision, passed its build matrix and summary.
- WorkMate PR [#165](https://github.com/suoak/AionUi/pull/165) merged as `f5693b1e0d6c5727aa9c171df217975c7f562e08`.
- WorkMate PR checks [37567188193](https://github.com/suoak/AionUi/actions/runs/37567188193) passed coverage, code quality, i18n, release tests, Ubuntu/macOS/Windows unit tests, and Linux/macOS/Windows builds. The merged `main` push checks passed in run [37568847797](https://github.com/suoak/AionUi/actions/runs/37568847797).
- WorkMate Windows x64 manual build [37573535393](https://github.com/suoak/AionUi/actions/runs/37573535393), pinned to the WorkMate merge revision and AionCore run `37571103049`, passed code quality, package build, fresh-install smoke, and build summary.
- The packaged artifacts are `windows-build-x64-f5693b1` and `windows-installer-diagnostics-x64-fresh-f5693b1`.

This evidence closes the cloud suite and packaged fixture/smoke gates. It does not claim that an authenticated Codex account retained native context across a real WorkMate/app-server restart.

## Packaged validation

Fixture-based packaged validation may run without completing M6.1 OAuth. It must prove startup, typed API/UI projection, installer integrity, and controlled multi-turn/restart/cancel/error paths. Real native-continuation acceptance requires an authenticated account:

1. start a fresh packaged Codex conversation and complete turn A;
2. capture the projected Thread ID and confirm Trace contains the native Turn ID;
3. complete turn B and verify it uses the same Thread and retained context;
4. restart app-server, then WorkMate, and complete turn C through `thread/resume` without resending the full transcript;
5. interrupt an active turn and confirm the exact Thread/Turn pair settles as interrupted;
6. exercise a missing Thread and confirm `RUNTIME_SESSION_NOT_FOUND`, preserved TaskSession/history, no replay, and an explicit new-session path;
7. change account identity generation and confirm process recycle plus revalidation;
8. inspect logs, support artifacts, Trace, and Review for credential or authorization-URL leakage;
9. record package/Core/WorkMate/Codex revisions, OS, UTC time, tester, and signed result.

M6.2 remains open until the real authenticated restart-resume acceptance above is recorded. M6 closure additionally requires the pending M6.1 real login acceptance.
