import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { afterEach, describe, expect, it } from 'vitest';
import { cmdInit } from '../../../packages/plugin-cli/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Core checks `engine.aionui` with the Rust `semver` crate (Cargo syntax):
 * comparators are separated by commas and every comparator must hold.
 * npm-style space-separated or `||` ranges do not parse there, and Core
 * filters such extensions out. This mirrors that rule for simple comparators
 * (AionCore `loader.rs` tests cover the real matcher with the same range).
 */
const cargoReqMatches = (req: string, version: string): boolean => {
  if (req.includes('||')) return false;
  const parts = req.split(',').map((p) => p.trim());
  if (parts.some((p) => p === '' || /\s/.test(p.replace(/^[<>=^~]+\s*/, '')))) return false;
  return parts.every((p) => semver.validRange(p) !== null && semver.satisfies(version, p));
};

const readEngine = (rel: string): string => {
  const manifest = JSON.parse(readFileSync(isAbsolute(rel) ? rel : join(root, rel), 'utf8')) as {
    engine?: { aionui?: string };
  };
  const req = manifest.engine?.aionui;
  expect(req, rel).toBeTypeOf('string');
  return req as string;
};

const assertAccepts2_6Through3x = (req: string, where: string) => {
  for (const v of ['2.6.0', '2.9.3', '3.0.0', '3.4.1']) {
    expect(cargoReqMatches(req, v), `${where} should accept app ${v}`).toBe(true);
  }
  for (const v of ['2.5.9', '4.0.0']) {
    expect(cargoReqMatches(req, v), `${where} should reject app ${v}`).toBe(false);
  }
};

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
});

describe('engine.aionui ranges accept the 3.0.0 app version', () => {
  it('the mirror rejects the old ^2.6.0 range for 3.0.0 and npm-only syntax', () => {
    expect(cargoReqMatches('^2.6.0', '2.6.0')).toBe(true);
    expect(cargoReqMatches('^2.6.0', '3.0.0')).toBe(false);
    expect(cargoReqMatches('>=2.6.0 <4.0.0', '3.0.0')).toBe(false);
    expect(cargoReqMatches('^2.6.0 || ^3.0.0', '3.0.0')).toBe(false);
  });

  it.each([
    'examples/github-workspace-plugin/aion-extension.json',
    'examples/session-analysis-plugin/aion-extension.json',
    'examples/deck-template-pack-plugin/aion-extension.json',
    'packages/plugin-cli/templates/basic/aion-extension.json',
  ])('%s', (rel) => {
    assertAccepts2_6Through3x(readEngine(rel), rel);
  });

  it('a plugin scaffolded by workmate-plugin-cli init', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wm-engine-'));
    temps.push(dir);
    const dest = join(dir, 'demo-plugin');
    expect(cmdInit('demo-plugin', dest)).toBe(0);
    assertAccepts2_6Through3x(readEngine(join(dest, 'aion-extension.json')), 'init');
  });

  it('the Contract v1 docs example', () => {
    const doc = readFileSync(join(root, 'docs/plugins/contract.md'), 'utf8');
    const m = doc.match(/"engine":\s*\{\s*"aionui":\s*"([^"]+)"/);
    expect(m).not.toBeNull();
    assertAccepts2_6Through3x(m![1], 'docs/plugins/contract.md');
  });
});
