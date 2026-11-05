import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('aion-extension-v1 schema', () => {
  it('is valid JSON and declares WorkMate contract title', () => {
    const raw = readFileSync(join(root, 'schemas/aion-extension-v1.json'), 'utf8');
    const schema = JSON.parse(raw) as { title?: string; required?: string[]; $defs?: Record<string, unknown> };
    expect(schema.title).toContain('CSBU WorkMate');
    expect(schema.required).toEqual(expect.arrayContaining(['name', 'version']));
    expect(schema.$defs?.agentTool).toBeTruthy();
    expect(schema.$defs?.command).toBeTruthy();
    expect(schema.$defs?.panel).toBeTruthy();
    expect(schema.$defs?.workPanelView).toBeTruthy();
    expect(schema.$defs?.backgroundService).toBeTruthy();
  });

  it('hello-world example still parses as JSON', () => {
    const raw = readFileSync(join(root, 'examples/hello-world-extension/aion-extension.json'), 'utf8');
    const manifest = JSON.parse(raw) as { name: string; $schema?: string };
    expect(manifest.name).toBe('hello-world');
    expect(manifest.$schema).toContain('aion-extension-v1.json');
  });
});
