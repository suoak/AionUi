# GitHub Workspace (sample plugin)

Contract v1 curated sample for CSBU WorkMate.

| Contribute                         | Purpose                        |
| ---------------------------------- | ------------------------------ |
| commands / panels / workPanelViews | PR workspace UI                |
| agentTools                         | plan-safe reads + gated writes |
| backgroundServices                 | metadata sync stub             |
| skills                             | PR review playbook             |

```bash
bun packages/plugin-cli/bin/workmate-plugin-cli.js check examples/github-workspace-plugin
bun packages/plugin-cli/bin/workmate-plugin-cli.js pack examples/github-workspace-plugin
```

Install via enterprise curated hub / whitelist only (v1).
