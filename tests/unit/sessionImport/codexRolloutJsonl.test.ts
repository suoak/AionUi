import { describe, expect, it } from 'vitest';
import { parseCodexRolloutJsonl } from '../../../packages/desktop/src/common/sessionImport/codexRolloutJsonl';

describe('parseCodexRolloutJsonl', () => {
  it('parses session_meta and response_item messages', () => {
    const jsonl = [
      JSON.stringify({
        type: 'session_meta',
        payload: { id: 'sess-9', cwd: '/work/app' },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          id: 'm1',
          role: 'user',
          content: [{ text: 'build it' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          id: 'm2',
          role: 'assistant',
          content: [{ text: 'sure' }],
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call',
          call_id: 'c1',
          name: 'shell',
          arguments: { cmd: 'ls' },
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'c1',
          output: 'ok',
        },
      }),
    ].join('\n');

    const parsed = parseCodexRolloutJsonl(jsonl);
    expect(parsed.cwd).toBe('/work/app');
    expect(parsed.sessionId).toBe('sess-9');
    expect(parsed.items.map((i) => i.transcript_kind)).toEqual([
      'user/message',
      'assistant/message',
      'tool/call',
      'tool/result',
    ]);
    expect(parsed.items[3].content).toBe('ok');
  });
});
