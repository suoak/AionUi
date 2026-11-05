import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  claudeProjectsRoot,
  claudeSessionIdFromPath,
  codexSessionIdFromPath,
  codexSessionsRoot,
} from '../../../packages/desktop/src/common/sessionImport/discoverPaths';

describe('discoverPaths', () => {
  it('builds default roots', () => {
    expect(claudeProjectsRoot('/home/u')).toBe(path.join('/home/u', '.claude', 'projects'));
    expect(codexSessionsRoot('/home/u')).toBe(path.join('/home/u', '.codex', 'sessions'));
    expect(codexSessionsRoot('/home/u', '/custom/codex')).toBe(path.join('/custom/codex', 'sessions'));
  });

  it('parses session ids from filenames', () => {
    expect(claudeSessionIdFromPath('/x/abc-def.jsonl')).toBe('abc-def');
    expect(codexSessionIdFromPath('/x/rollout-2026-01-02T03-04-05-uuid-here.jsonl')).toBe('uuid-here');
  });
});
