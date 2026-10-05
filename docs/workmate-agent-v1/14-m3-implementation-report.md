# M3 implementation report

## Status

```text
M0   = CLOSED
M1   = CLOSED
M1.5 = CLOSED
M2   = CLOSED
M3   = PARTIAL

Automatic Planning = ENABLED_FOR_GUARANTEED_ONLY
```

M3 remains partial. The first milestone is a runtime-enforced planning path for Aion Agent; it does not require every supported agent to provide the same isolation level.

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

## Deliberately deferred

- Safe readonly shell and Git processes.
- Trusted readonly MCP in guaranteed planning.
- Upgrading Codex, Claude, or CodeBuddy isolation.
- Closing M3 as a whole.
- Publishing a new AionCore release or changing the formal WorkMate AionCore pin.

## Verification state

The focused local checks and remote CI evidence are tracked in [17-automatic-planning-validation.md](17-automatic-planning-validation.md). `GUARANTEED` must not be claimed for a build whose enforcement tests have not passed.
