# CSBU WorkMate Design System / 设计系统 (v2, 3.0.0)

This document defines the visual language for the CSBU WorkMate 3.0.0 UI overhaul.
Code constants live in [`designTokens.ts`](../../packages/desktop/src/common/theme/designTokens.ts);
the overridable theme contract is in [`tokens.md`](./tokens.md).

> 本文件定义 CSBU WorkMate 3.0.0 界面全面优化的视觉语言。代码常量在 `designTokens.ts`，
> 主题可覆盖 Token 合约见 `tokens.md`。

## 1. Principles / 原则

1. **One accent.** Each theme has exactly one accent colour (`--wm-accent`). Status colours are
   reserved for run states and never used as decoration. / 每个主题只有一个强调色；状态色只表示运行状态。
2. **Status is shared.** The five run states — `working`, `needsYou`, `done`, `failed`, `idle` —
   look the same on every surface (sidebar, task card, tab, Cmd+K, notification, dock badge).
   / 五种运行状态在所有界面同一图形、同一颜色。
3. **Quiet chrome, loud content.** Chrome uses 13 px text and low-contrast borders; content uses
   14 px body text with relaxed line height. / 外框安静，内容清楚。
4. **Readable by default.** Every text token passes WCAG AA (4.5:1) on every surface it sits on;
   control boundaries pass 3:1. Disabled text is the only exemption. / 所有文字 Token 在其背景上达到 AA。
5. **Motion explains, never decorates.** Three durations, one easing, and everything is disabled
   under `prefers-reduced-motion`. / 动效只解释状态变化，并尊重“减少动态效果”。
6. **No hard-coded colours in components.** Use `--wm-*` tokens (or the UnoCSS utilities that map
   to them). Raw palette variables (`--bg-6`, `--aou-*`, Arco `--color-*`) are implementation
   details of the theme layer. / 组件内禁止写死颜色。

## 2. Default themes / 默认主题

The 3.0.0 default themes are **Ember** (light) and **Dusk** (dark), with colour values derived
from Orca's MIT-licensed "Dusk & Ember" plugin (see [Attribution](#8-attribution--署名)).
Existing Light/Dark users move to them automatically and can switch back with one click
("经典浅色 / 经典深色"). The seven decorative presets move into a collapsed "更多主题" group.

### 2.1 Semantic colours / 语义色

| Token                   | Ember (light) | Dusk (dark) | Use / 用途                             |
| ----------------------- | ------------- | ----------- | -------------------------------------- |
| `--wm-surface-canvas`   | `#fffaf4`     | `#241843`   | Main content / 主内容区                |
| `--wm-surface-sidebar`  | `#fde6cf`     | `#150f28`   | Sidebar / 侧边栏                       |
| `--wm-surface-panel`    | `#fff6ec`     | `#1d1533`   | Right panel, status bar / 右栏、状态栏 |
| `--wm-surface-raised`   | `#ffffff`     | `#2c1f4d`   | Cards, inputs, popovers / 卡片、输入框 |
| `--wm-text-primary`     | `#3b1d0a`     | `#e8e0ff`   | Primary text                           |
| `--wm-text-secondary`   | `#6b3c1c`     | `#b9aee0`   | Secondary text                         |
| `--wm-text-tertiary`    | `#845f45`     | `#9288b5`   | Tertiary text (AA on every surface)    |
| `--wm-border-subtle`    | `#f5ddc5`     | `#36265d`   | Region dividers                        |
| `--wm-border-default`   | `#ecc9a5`     | `#4a3480`   | Cards, inputs                          |
| `--wm-border-strong`    | `#bd7048`     | `#8461b0`   | Control boundaries (>= 3:1)            |
| `--wm-accent`           | `#b4410f`     | `#c38bff`   | The accent / 强调色                    |
| `--wm-accent-hover`     | `#9e390d`     | `#ca99ff`   | Accent hover                           |
| `--wm-accent-subtle`    | `#f6e0d1`     | `#31234b`   | Accent-tinted background               |
| `--wm-status-working`   | accent        | accent      | Working (spinner) / 进行中             |
| `--wm-status-needs-you` | `#b45309`     | `#fbbf24`   | Needs you / 需要你                     |
| `--wm-status-done`      | `#15803d`     | `#34d399`   | Done / 完成                            |
| `--wm-status-failed`    | `#dc2626`     | `#f87171`   | Failed / 失败                          |
| `--wm-status-idle`      | tertiary text | tertiary    | Idle / 空闲                            |

Values live in `packages/desktop/src/renderer/theme/default/{ember,dusk}.css` and are checked by
`tests/unit/theme/design/defaultThemes.test.ts` (every text token ≥ 4.5:1 on all four surfaces;
strong borders and status colours ≥ 3:1). Four Orca values were adjusted to pass: Ember tertiary text
(`#906b50` → `#845f45`), both strong borders, and the Ember needs-you / done colours.

### 2.1.1 How the themes are wired / 主题接线

- Built-in ids `light` / `dark` now carry the Ember / Dusk stylesheet as their `css`, so existing
  Light, Dark and Follow System selections switch automatically.
- `classic-light`, `classic-dark` and the `system-classic` sentinel are the pre-3.0 palette (no
  overrides). The quick light/dark toggle stays inside whichever family is active.
- A one-time notice (`theme.refreshNoticeShown`) offers "Restore classic look" to users whose
  selection moved to Ember / Dusk. Classic, decorative and custom themes never see it.
- The seven decorative presets are listed under a collapsed "More themes" group (expanded when
  one of them is active).
- Classic and decorative themes get the `--wm-*` layer from `default-color-scheme.css`, mapped onto
  their legacy variables, with an AA-safe tertiary text colour.
- `prefers-reduced-motion: reduce` collapses all animations and transitions (`base.css`).

### 2.2 Legacy variable mapping / 旧变量映射

V1 maps the existing layers onto the semantic tokens so un-migrated components follow the theme:

| Legacy                                     | Maps to                                     |
| ------------------------------------------ | ------------------------------------------- |
| `--bg-base`, `--bg-1`                      | `--wm-surface-canvas`, `--wm-surface-panel` |
| `--text-primary/secondary`                 | `--wm-text-primary/secondary`               |
| UnoCSS `t-tertiary` (was `--bg-6`, 2.4:1)  | `--wm-text-tertiary`                        |
| `--border-base/light`                      | `--wm-border-default/subtle`                |
| `--primary`, `--brand`, Arco `--primary-6` | `--wm-accent`                               |
| `--success/warning/danger`                 | `--wm-status-done/needs-you/failed`         |
| `--sider-*`                                | `--wm-surface-sidebar`                      |

## 3. Scales / 尺度

| Scale       | Values                                                                         |
| ----------- | ------------------------------------------------------------------------------ |
| Type (px)   | caption 11 · secondary 12 · ui 13 · body 14 · subtitle 16 · title 20 · hero 28 |
| Line height | ui 1.5 · message 1.65                                                          |
| Spacing     | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 (4-point grid)                             |
| Radius      | inner 4 · control 6 · card 10 · panel 14 · pill                                |
| Motion      | hover 120 ms · panel 180 ms · page 240 ms · `cubic-bezier(0.2, 0.8, 0.2, 1)`   |

Font: the system UI stack (unchanged), with tabular numerals for counters, timers and token
usage. Code: the user's monospace setting.

## 4. Iconography / 图标

Keep `@icon-park/react`: outline theme, 16 px in chrome (20 px in empty states), `strokeWidth` 3
(IconPark units, the existing house style), colour `currentColor`. Do not mix icon families. A thin `WmIcon` wrapper (V2) fixes these
defaults.

## 5. Run-state glyphs / 状态图形

| State      | Glyph                               | Colour                  |
| ---------- | ----------------------------------- | ----------------------- |
| `working`  | 12 px spinning ring                 | `--wm-status-working`   |
| `needsYou` | question mark in a ring, soft pulse | `--wm-status-needs-you` |
| `done`     | check                               | `--wm-status-done`      |
| `failed`   | cross                               | `--wm-status-failed`    |
| `idle`     | hollow dot                          | `--wm-status-idle`      |

Under reduced motion the spinner becomes a static three-quarter ring and the pulse is removed.
Colour is never the only signal: every glyph has a distinct shape and an accessible label.

## 6. Base components (V2) / 基础组件

Import from `@renderer/components/design`.

| Component     | Purpose                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `StatusGlyph` | The run-state glyph above                                                       |
| `EmptyState`  | Icon + title + one sentence + one primary action (replaces bare Arco `<Empty>`) |
| `PageHeader`  | Title, optional description, right-aligned actions                              |
| `Chip`        | Removable context chip (files, @agents, skills) in the composer                 |
| `SplitButton` | Primary action with a dropdown of alternatives (e.g. adopt / open PR)           |
| `RailPanel`   | Right icon-rail + collapsible panel host                                        |
| `KeyHint`     | Platform-aware keyboard shortcut hint (⌘ / Ctrl)                                |
| `ContextRing` | Context-window usage ring                                                       |
| `WmIcon`      | Icon wrapper with design-system defaults                                        |

All components are built on Arco primitives, take strings via i18n, and support RTL (`fa-IR`)
using logical CSS properties (`margin-inline-start`, `inset-inline-end`).

## 7. App shell (V3) / 应用外框

```
┌ titlebar ─────────────────────────── search · 🔔 · ⌘K · panel · window ┐
│ sidebar            │ content                     │ icon rail (V4)   │
│ [+ 新会话 ▾]       │                             │                  │
│ ─ 任务             │                             │                  │
│ ─ 智能体           │                             │                  │
│ ─ 技能             │                             │                  │
│ ─ 自动化           │                             │                  │
│ ─ 助手 (until U4)  │                             │                  │
│ plugin panels      │                             │                  │
│ pinned / projects  │                             │                  │
├ status bar 24 px: host · running · needs you ······ today · update · ⌘K ┤
```

Primary navigation keys: `sessions | tasks | agents | skills | automations`.

- **Sidebar fixed area is at most six rows.** "New ▾" holds new chat, import tasks from GitHub
  issues and batch-manage conversations. Plugin panels scroll with the history.
- **Rows use the run-state glyphs.** A conversation shows `working` or `needsYou` in place of
  its icon; unread rows are bold, with no badge.
- **Titlebar bell = inbox.** The badge counts unread items; opening an item marks it read and
  deep-links to the task drawer, batch job, conversation or scheduled task.
- **Status bar (desktop).** Host (this computer or the remote host, opens Host settings) ·
  running conversations · conversations that need you (opens the first one) · today's tokens
  (opens Usage) · a downloaded update (opens About) · ⌘K. Mobile and narrow WebUI have no
  status bar or bell, so the sidebar keeps its usage and inbox rows there.
- Open the command palette from code with `requestCommandPalette()`.

## 8. Attribution / 署名

The Ember and Dusk colour values are derived from "Dusk & Ember Themes" (orca-dusk-ember 1.1.0),
<https://github.com/stablyai/orca-plugins/tree/main/plugins/dusk-ember> at commit
`4589eb93e28d8a4e4fdd3a77670297da804e7abe`, MIT License, Copyright (c) 2026 Lovecast Inc.
Only colour values were used; no code, images or terminal/syntax palettes were copied. Other
products referenced during design research (Orca, Multica, Open Vetta, PI-Desktop, Codeg)
informed ideas only — no code from them is included.
