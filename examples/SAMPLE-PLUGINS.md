# Contract v1 sample plugins (curated)

Generated / maintained for **CSBU WorkMate** Plugin Contract v1. Install path: curated only.

| Directory                   | Sample                              |
| --------------------------- | ----------------------------------- |
| `github-workspace-plugin`   | GitHub PR/issue workspace           |
| `session-analysis-plugin`   | Session analytics (read-only tools) |
| `deck-template-pack-plugin` | Deck / slide template pack          |

Validate all:

```bash
for d in examples/github-workspace-plugin examples/session-analysis-plugin examples/deck-template-pack-plugin; do
  bun packages/plugin-cli/bin/workmate-plugin-cli.js check "$d"
done
```
