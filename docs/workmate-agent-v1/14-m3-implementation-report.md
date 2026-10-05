# M3 implementation report

## Status

```text
M0   = CLOSED
M1   = CLOSED
M1.5 = CLOSED
M2   = CLOSED
M3   = CLOSED

Automatic Planning = ENABLED_FOR_GUARANTEED_ONLY
```

M3 is closed by the released and packaged runtime evidence recorded in [17-automatic-planning-validation.md](17-automatic-planning-validation.md). Closure requires at least one runtime with mandatory, non-bypassable planning enforcement; it does not require every supported agent to provide the same isolation level.

## Isolation matrix

| Runtime                 | Isolation                                              | Automatic planning |
| ----------------------- | ------------------------------------------------------ | ------------------ |
| Aion Agent              | `GUARANTEED` when the strict runtime profile is active | Enabled            |
| Codex                   | `BEST_EFFORT`                                          | Disabled           |
| Claude                  | `BEST_EFFORT`                                          | Disabled           |
| CodeBuddy / generic ACP | `UNSUPPORTED`                                          | Disabled           |

The Aion result is conditional on all evidence in [15-aion-enforcement-paths.md](15-aion-enforcement-paths.md) and [16-aion-strict-planning.md](16-aion-strict-planning.md). If the registered tool inventory, bootstrap restrictions, or runtime gate changes without matching tests, the assessment must fail closed instead of retaining `GUARANTEED`.

## Implemented

- Runtime-specific planning-isolation assessment and API.
- Aion strict profile limited to `Read`, `Grep`, `Glob`, and `ViewImage`.
- Runtime policy enforcement before legacy allowlist and approval handling.
- MCP servers, hooks, native plan tools, Skill, Spawn, shell, and mutation tools disabled in strict planning.
- Automatic planning gated on `planningIsolation == GUARANTEED`.
- Automatic output persisted as an immutable plan artifact in `waiting_approval`.
- Existing M2 hash-bound approval and single execution claim remain unchanged.
- WorkMate exposes the isolation result and never enables automatic planning for `BEST_EFFORT` or `UNSUPPORTED`.

## Closure criteria

M3 is closed because the released product now demonstrates all of the following:

- Tool capability classification and a mandatory policy gateway.
- `ALLOW`, `ASK`, and `DENY`, with unknown tools failing closed.
- Runtime-based isolation assessment and mandatory enforcement.
- Aion Agent as a proven `GUARANTEED` runtime.
- Mutation and legacy-allowlist bypass proofs against a real workspace.
- Automatic planning enabled only for `GUARANTEED`.
- `BEST_EFFORT` and `UNSUPPORTED` runtimes failing closed in both API and UI.
- Immutable plan artifact submission into `waiting_approval`.
- M2 hash-bound approval and single-claim execution preserved.
- Restart recovery that cannot replay mutation or promote planning into execution.
- A packaged WorkMate smoke using the released AionCore v0.2.14 binary.

Codex, Claude, and CodeBuddy are runtime capability states, not M3 closure blockers. Their levels remain evidence-based and automatic planning remains disabled for all three.

## Deliberately deferred

- Safe readonly shell and Git processes.
- Trusted readonly MCP in guaranteed planning.
- Upgrading Codex, Claude, or CodeBuddy isolation.

## Release integration

- AionCore v0.2.14 is published for Linux x64/arm64, macOS x64/arm64, and Windows x64/arm64 with verified SHA-256 checksums.
- WorkMate pins v0.2.14 in the independent commit `e4bfabaec` (`build: bump AionCore to v0.2.14`).
- The packaged Windows x64 release gate passed against the downloaded v0.2.14 artifact.
- Product policy remains `Automatic Planning = ENABLED_FOR_GUARANTEED_ONLY`.

## Verification state

The focused local checks, release checksums, and packaged CI evidence are tracked in [17-automatic-planning-validation.md](17-automatic-planning-validation.md). `GUARANTEED` must not be claimed for a build whose enforcement tests have not passed.
