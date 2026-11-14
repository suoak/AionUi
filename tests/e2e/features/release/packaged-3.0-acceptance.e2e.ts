/**
 * 3.0.0 packaged-build acceptance smoke (CSBU WorkMate).
 *
 * Runs against the packaged app under out/ (E2E_PACKAGED=1, as the M3 release gate does) on
 * Linux (xvfb), macOS and Windows. It checks what only a packaged build can prove:
 *   - branding: app name, window title, no legacy "AionUi" text in the shell;
 *   - the five primary entries in the sider (IA-1);
 *   - the E11 worktree terminal: node-pty is packaged and a real shell round-trips a command;
 *   - built-in signed packs (E13 B1–B5): installed through the signed host path (on Windows the
 *     verified reader), listed, the theme registered, and the panel served into its sandboxed
 *     iframe.
 *
 * The built-in pack checks need a bundled Core that ships them. The pinned `aioncoreVersion` may
 * predate them, so they are asserted when `E2E_EXPECT_BUILTIN_PACKS=1` (acceptance builds made
 * with a current Core) and otherwise reported as skipped with the reason.
 */
import os from 'node:os';
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { invokeBridge } from '../../helpers/bridge';
import { httpGet } from '../../helpers/httpBridge';
import { navigateTo, waitForSettle } from '../../helpers/navigation';

const BUILTIN_PACKS = ['workmate.sample-checklist', 'workmate.sample-shortcuts', 'workmate.theme-dusk-ember'];
const EXPECT_BUILTINS = process.env.E2E_EXPECT_BUILTIN_PACKS === '1';

/** Sider labels in either shipped locale (en-US / zh-CN). */
const PRIMARY_LABELS: Record<string, RegExp> = {
  workItems: /^(Work items|工作项)$/,
  agents: /^(Agents|智能体)$/,
  skills: /^(Skills|技能)$/,
  batch: /^(Batch|批量)$/,
};

type PtySession = { id: string; available: boolean; error?: string; agentAttached: boolean };

async function siderText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('.layout-sider, aside, [class*="sider"]')?.textContent ?? '');
}

test.describe('3.0.0 packaged acceptance', () => {
  test('branding: CSBU WorkMate name and title, no legacy AionUi shell text', async ({ electronApp, page }) => {
    const appName = await electronApp.evaluate(({ app }) => app.getName());
    expect(appName).toBe('CSBU WorkMate');
    await navigateTo(page, '#/guid');
    await waitForSettle(page);
    await expect.poll(() => page.title(), { timeout: 15_000 }).toContain('CSBU WorkMate');
    const shellText = await page.evaluate(() => document.body.innerText);
    expect(shellText).not.toMatch(/AionUi/);
  });

  test('five primary entries are in the sider', async ({ page }) => {
    await navigateTo(page, '#/guid');
    await waitForSettle(page);
    await expect(page.getByTestId('sider-tasks-board-entry').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('sider-batch-entry').first()).toBeVisible();
    const text = await siderText(page);
    for (const [key, label] of Object.entries(PRIMARY_LABELS)) {
      const found = await page
        .getByText(label)
        .first()
        .isVisible()
        .catch(() => false);
      expect(found, `primary entry ${key} not visible; sider text: ${text.slice(0, 400)}`).toBe(true);
    }
    // Sessions is the toolbar "new conversation" entry plus history.
    await expect(page.getByText(/^(New conversation|New Chat|新对话|新建对话|新会话)$/).first()).toBeVisible();
  });

  test('worktree terminal: packaged node-pty runs a real shell command', async ({ page }) => {
    const session = await invokeBridge<PtySession>(page, 'worktreePty.create', {
      cwd: os.tmpdir(),
      cols: 100,
      rows: 30,
    });
    expect(session.available, `PTY unavailable in packaged build: ${session.error ?? ''}`).toBe(true);
    try {
      await invokeBridge(page, 'worktreePty.set-agent-attached', { id: session.id, attached: true });
      // The product only appears in the output, never in the typed input.
      const command = process.platform === 'win32' ? 'set /a 123456*7\r' : 'echo $((123456*7))\r';
      await invokeBridge(page, 'worktreePty.write', { id: session.id, data: command });
      await expect
        .poll(
          async () =>
            (await invokeBridge<{ data: string }>(page, 'worktreePty.read-for-agent', { id: session.id })).data,
          { timeout: 20_000, message: 'shell output never contained 864192' }
        )
        .toContain('864192');
    } finally {
      await invokeBridge(page, 'worktreePty.kill', { id: session.id }).catch(() => undefined);
    }
  });

  test('built-in signed packs are installed, listed and served', async ({ page }) => {
    const extensions = await httpGet<Array<{ name: string }>>(page, '/api/extensions');
    const loaded = (Array.isArray(extensions) ? extensions : []).map((e) => e.name);
    const present = BUILTIN_PACKS.filter((name) => loaded.includes(name));
    if (!EXPECT_BUILTINS && present.length === 0) {
      test.skip(true, 'bundled Core ships no built-in packs (pinned aioncoreVersion predates E13 B1-B5)');
    }
    expect(present, `loaded extensions: ${loaded.join(', ')}`).toEqual(BUILTIN_PACKS);
    const themes = await httpGet<Array<{ id?: string; name?: string }>>(page, '/api/extensions/themes');
    expect(JSON.stringify(themes), 'dusk-ember theme registered').toMatch(/dusk/i);
    const panels = await httpGet<unknown>(page, '/api/extensions/panels');
    expect(JSON.stringify(panels), 'shortcuts panel listed').toContain('workmate.sample-shortcuts');

    await navigateTo(page, '#/guid');
    await waitForSettle(page);
    const panel = page.locator('[data-testid^="sider-plugin-panel-"][data-panel-id*="shortcuts"]').first();
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await panel.click();
    // Served by Core's verified asset route into an opaque-origin sandbox (F1).
    const selector =
      'iframe[sandbox="allow-scripts"][title*="Shortcuts"], iframe[sandbox="allow-scripts"][title*="快捷键"]';
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.frameLocator(selector).first().locator('h1')).toContainText(/Shortcuts|快捷键/, {
      timeout: 20_000,
    });
  });
});
