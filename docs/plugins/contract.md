# CSBU WorkMate Plugin Contract v1

Status: **S8 public contract**. Host already loads extensions via Core `aionui-extension`. This document freezes the _public_ shape authors should target. Brand: **CSBU WorkMate** only.

## Security posture

- Plugins may run in the desktop renderer / Node helper paths — **not a full sandbox**.
- **v1 install path is curated only** (enterprise hub / whitelist). Do not distribute arbitrary third-party zips as a supported channel yet.
- Declare the minimum `permissions`. The host derives Safe / Moderate / Dangerous risk for the UI.
- No AGPL dependencies in plugins intended for WorkMate distribution.

## Manifest file

Root file: **`aion-extension.json`** (name kept for compatibility).

```json
{
  "$schema": "../../schemas/aion-extension-v1.json",
  "name": "my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "description": "…",
  "engine": { "aionui": "^2.6.0" },
  "permissions": {
    "storage": true,
    "network": false,
    "shell": false,
    "filesystem": "extension-only",
    "events": true
  },
  "contributes": {}
}
```

CamelCase and snake_case keys are both accepted; the host normalizes to snake_case on parse.

### Reserved names

Extension `name` must not use reserved prefixes owned by the product (see Core `RESERVED_NAME_PREFIXES`).

## Permissions

| Key          | Meaning                                             |
| ------------ | --------------------------------------------------- |
| `storage`    | Extension-local storage                             |
| `network`    | `true`, `false`, or `{ allowedDomains, reasoning }` |
| `shell`      | Spawn shell commands                                |
| `filesystem` | `extension-only` \| `workspace` \| `full`           |
| `clipboard`  | Clipboard read/write                                |
| `activeUser` | Current user identity                               |
| `events`     | Host event bus                                      |

## Contribution points

### Existing (already wired)

`acpAdapters`, `mcpServers`, `assistants`, `agents`, `skills`, `themes`, `channelPlugins`, `webui`, `settingsTabs`, `modelProviders`.

### Contract v1 additions (parse in Core S8; UI wiring may follow)

#### `commands`

Command-palette entries.

```json
{ "id": "myPlugin.hello", "title": "Say Hello", "keybinding": "ctrl+shift+h", "when": "workmate.ready" }
```

#### `panels`

Standalone panels (`entryPoint` relative HTML/JS).

```json
{ "id": "myPlugin.panel", "title": "My Panel", "entryPoint": "panels/main.html", "icon": "assets/icon.svg" }
```

#### `workPanelViews`

Views hosted in the work panel / sidebar surface.

```json
{ "id": "myPlugin.work", "title": "Work view", "entryPoint": "views/work.html", "placement": "secondary" }
```

#### `agentTools` (**requires `planSafeActions`**)

Tools the agent may invoke. Authors **must** set `planSafeActions`:

- `true` — safe to auto-run while the session is in plan mode
- `false` — always needs the normal approval path (default intent if you are unsure)

```json
{
  "id": "myPlugin.summarize",
  "name": "Summarize selection",
  "description": "Read-only summary",
  "planSafeActions": true,
  "handler": "tools/summarize.js"
}
```

#### `backgroundServices`

Long-running helpers. Effective rights cannot exceed root `permissions`.

```json
{ "id": "myPlugin.sync", "entryPoint": "services/sync.js", "description": "Background sync" }
```

#### `mcpServers`

Unchanged. Prefer WorkMate-managed MCP with strict isolation in enterprise policies.

## Lifecycle

Optional hooks: `onInstall`, `onUninstall`, `onActivate`, `onDeactivate` (paths relative to the extension root).

## `$file:` includes

Manifest values may use `$file:relative/path.json` to inline JSON (or text) from the extension directory. Paths cannot escape the extension root.

## Forward compatibility

Unknown top-level or `contributes.*` keys are **ignored** (with host logs). Invalid _known_ entries are skipped per item when possible so one bad tool does not block themes.

## CLI

`workmate-plugin-cli init|check|pack|watch` — see package `@csbu-workmate/plugin-cli`.

## Marketplace

Enterprise curated hub / signing — **M9 S10**, not part of this contract freeze.

## Sample plugins

Curated Contract v1 samples (not an open marketplace):

- `examples/github-workspace-plugin` — GitHub workspace (network allowlist + plan-safe reads / gated writes)
- `examples/session-analysis-plugin` — session analytics (read-only `agentTools`)
- `examples/deck-template-pack-plugin` — deck template pack (skills + themes)

Validate with `workmate-plugin-cli check <dir>`.
