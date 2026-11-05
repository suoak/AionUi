# GitHub Workspace — agent notes

Brand: **CSBU WorkMate**. Contract v1, curated-install only.

- Read tools (`listPrs`, `getFile`) set `planSafeActions: true`.
- Write tools (`createPr`, `commentIssue`) set `planSafeActions: false` — host must confirm outside plan mode.
- Network allowlist is `github.com` / `api.github.com` only. No AGPL deps.
- Validate: `workmate-plugin-cli check .` then `pack`.
