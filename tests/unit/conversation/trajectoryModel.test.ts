import { buildTrajectoryPath } from '@/common/types/journalTranscript';
import { describe, expect, it } from 'vitest';

describe('buildTrajectoryPath', () => {
  it('builds the latest semantic page without an empty query string', () => {
    expect(buildTrajectoryPath({ conversation_id: 'conv-1' })).toBe('/api/conversations/conv-1/trajectory');
  });

  it('builds older and incremental cursors explicitly', () => {
    expect(buildTrajectoryPath({ conversation_id: 'conv-1', before_sequence: 20, limit: 100 })).toBe(
      '/api/conversations/conv-1/trajectory?before_sequence=20&limit=100'
    );
    expect(buildTrajectoryPath({ conversation_id: 'conv-1', after_sequence: 20 })).toBe(
      '/api/conversations/conv-1/trajectory?after_sequence=20'
    );
  });

  it('keeps raw diagnostics on a separate endpoint', () => {
    expect(buildTrajectoryPath({ conversation_id: 'conv-1', limit: 50 }, true)).toBe(
      '/api/conversations/conv-1/trajectory/raw?limit=50'
    );
  });
});
