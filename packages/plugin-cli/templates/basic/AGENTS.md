# {{displayName}} — CSBU WorkMate plugin

This directory is a **curated** CSBU WorkMate extension (Plugin Contract v1).

## Commands

- `workmate-plugin-cli check` — validate `aion-extension.json` against the contract schema
- `workmate-plugin-cli pack` — write a `.wmx` zip of this extension
- `workmate-plugin-cli watch` — re-run `check` when files change

## Rules

- Brand: **CSBU WorkMate** only
- v1 install path is curated / enterprise whitelist — not a full sandbox
- Agent tools must set `planSafeActions` explicitly
- No AGPL dependencies

See `docs/plugins/contract.md` in the WorkMate repo for the full contract.
