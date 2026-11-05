import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cmdCheck, cmdInit, cmdPack, validateManifest } from '../../../packages/plugin-cli/src/index.ts';

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) {
    rmSync(t, { recursive: true, force: true });
  }
});

describe('workmate-plugin-cli validateManifest', () => {
  it('requires name and version', () => {
    expect(validateManifest({})).toEqual(expect.arrayContaining(['name is required', 'version is required']));
  });

  it('requires planSafeActions on agent tools', () => {
    const errs = validateManifest({
      name: 'x',
      version: '1.0.0',
      contributes: { agentTools: [{ id: 'a', name: 'A' }] },
    });
    expect(errs.some((e) => e.includes('planSafeActions'))).toBe(true);
  });

  it('accepts plan_safe_actions snake_case', () => {
    expect(
      validateManifest({
        name: 'x',
        version: '1.0.0',
        contributes: { agent_tools: [{ id: 'a', name: 'A', plan_safe_actions: false }] },
      })
    ).toEqual([]);
  });
});

describe('workmate-plugin-cli init/check/pack', () => {
  it('scaffolds and checks a plugin', () => {
    const root = mkdtempSync(join(tmpdir(), 'wm-plugin-'));
    temps.push(root);
    const dest = join(root, 'demo-plugin');
    expect(cmdInit('demo-plugin', dest)).toBe(0);
    expect(existsSync(join(dest, 'aion-extension.json'))).toBe(true);
    expect(existsSync(join(dest, 'AGENTS.md'))).toBe(true);
    const body = readFileSync(join(dest, 'AGENTS.md'), 'utf8');
    expect(body).toContain('CSBU WorkMate');
    const manifest = JSON.parse(readFileSync(join(dest, 'aion-extension.json'), 'utf8')) as {
      name: string;
    };
    expect(manifest.name).toBe('demo-plugin');
    expect(cmdCheck(dest)).toBe(0);
    expect(cmdPack(dest, join(root, 'out.wmx'))).toBe(0);
    expect(existsSync(join(root, 'out.wmx'))).toBe(true);
  });
});
