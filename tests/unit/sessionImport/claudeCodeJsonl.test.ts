import { describe, expect, it } from 'vitest';
import { parseClaudeCodeJsonl } from '../../../packages/desktop/src/common/sessionImport/claudeCodeJsonl';
import { itemsToJournalTranscript } from '../../../packages/desktop/src/common/sessionImport/toJournalTranscript';

describe('parseClaudeCodeJsonl', () => {
  it('extracts user and assistant text turns', () => {
    const jsonl = [
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        sessionId: 's1',
        cwd: '/tmp/demo',
        message: { content: 'hello from user' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a1',
        sessionId: 's1',
        message: {
          content: [
            { type: 'text', text: 'hi there' },
            { type: 'tool_use', id: 'tool-1', name: 'Read', input: { path: 'a.ts' } },
          ],
        },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'u2',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file contents' }],
        },
      }),
    ].join('\n');

    const parsed = parseClaudeCodeJsonl(jsonl);
    expect(parsed.cwd).toBe('/tmp/demo');
    expect(parsed.sessionId).toBe('s1');
    expect(parsed.items.map((i) => i.transcript_kind)).toEqual([
      'user/message',
      'assistant/message',
      'tool/call',
      'tool/result',
    ]);
    const transcript = itemsToJournalTranscript('conv-1', parsed.items, 'claude-code');
    expect(transcript.model_visible_count).toBe(4);
    expect(transcript.items[0].content).toBe('hello from user');
  });

  it('skips sidechain lines', () => {
    const jsonl = JSON.stringify({
      type: 'user',
      uuid: 'x',
      isSidechain: true,
      message: { content: 'side' },
    });
    expect(parseClaudeCodeJsonl(jsonl).items).toHaveLength(0);
  });
});
