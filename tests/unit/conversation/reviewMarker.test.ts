import { describe, expect, it } from 'vitest';
import { parseReviewBlock } from '@/renderer/pages/conversation/Messages/components/reviewMarker';

// Mirrors aionui-review's `render_review_block` output.
const BLOCK = [
  '[[AION_REVIEW batch=b-1 count=2]]',
  '以下是用户对当前改动的逐行批注。',
  '',
  '#1 src/a.ts  L2（新版本）',
  '```ts',
  'const x = 1;',
  '批注：not a note, inside the fence',
  '```',
  '批注：rename x',
  'and add a test',
  'Agent 回复：done',
  '',
  '#2 src/b.ts  L3–L5（新版本）（代码已改动，批注时的原文如下）',
  '批注：why?',
  '[[/AION_REVIEW]]',
  '',
].join('\n');

describe('parseReviewBlock', () => {
  it('reads batch, preface and every note', () => {
    const block = parseReviewBlock(BLOCK);
    expect(block).not.toBeNull();
    expect(block!.batchId).toBe('b-1');
    expect(block!.count).toBe(2);
    expect(block!.preface).toBe('以下是用户对当前改动的逐行批注。');
    expect(block!.notes).toEqual([
      { number: 1, heading: 'src/a.ts  L2（新版本）', note: 'rename x\nand add a test' },
      { number: 2, heading: 'src/b.ts  L3–L5（新版本）（代码已改动，批注时的原文如下）', note: 'why?' },
    ]);
    expect(block!.raw).toBe(BLOCK.trim());
  });

  it('ignores ordinary messages and broken blocks', () => {
    expect(parseReviewBlock('hello')).toBeNull();
    expect(parseReviewBlock('see [[AION_REVIEW batch=b count=1]] later')).toBeNull();
    expect(parseReviewBlock('[[AION_REVIEW batch=b count=1]]\nno close')).toBeNull();
    expect(parseReviewBlock('[[AION_REVIEW oops]]\n[[/AION_REVIEW]]')).toBeNull();
  });
});
