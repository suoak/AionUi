# CSBU WorkMate plugins

Public extension surface for **CSBU WorkMate** (curated plugins only in v1).

| Doc                                                                          | Purpose                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| [contract.md](./contract.md)                                                 | Plugin Contract v1 — manifest, permissions, contributes |
| [llms.txt](./llms.txt)                                                       | Short machine-readable summary for coding agents        |
| [../../schemas/aion-extension-v1.json](../../schemas/aion-extension-v1.json) | JSON Schema for `aion-extension.json`                   |

Scaffold and validate with `workmate-plugin-cli` (package `@csbu-workmate/plugin-cli`): `init`, `check`, `pack`, `watch`.

Examples under `examples/*-extension` remain the living fixtures. Contract v1 **curated sample plugins**:

| Directory | Sample |
| --- | --- |
| [`examples/github-workspace-plugin`](../../examples/github-workspace-plugin) | GitHub PR/issue workspace |
| [`examples/session-analysis-plugin`](../../examples/session-analysis-plugin) | Session analytics |
| [`examples/deck-template-pack-plugin`](../../examples/deck-template-pack-plugin) | Deck / slide template pack |

See [`examples/SAMPLE-PLUGINS.md`](../../examples/SAMPLE-PLUGINS.md). The internal curated marketplace ships later (M9 S10).
