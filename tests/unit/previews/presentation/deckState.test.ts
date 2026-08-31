import { describe, expect, it } from 'vitest';
import type { DeckSpecV1 } from '@/common/types/office/presentation';
import {
  canFinalizeSave,
  changeSlideLayout,
  duplicateSlide,
  isCurrentRevision,
  moveSlide,
  parseDeckSpec,
  removeSlide,
  resolveAssetFileRef,
  resolveLayoutSlots,
  setAssetReady,
  serializeDeckSpec,
  updateBlock,
} from '@/renderer/pages/conversation/Preview/components/PresentationStudio/deckState';

const deck = (): DeckSpecV1 => ({
  schemaVersion: 1,
  revision: 4,
  stage: 'ready',
  metadata: { title: 'Quarterly review', language: 'en-US', aspectRatio: '16:9' },
  theme: { id: 'business-light' },
  slides: [
    {
      id: 'cover',
      role: 'cover',
      layoutId: 'cover',
      blocks: [{ id: 'title', type: 'text', slot: 'title', text: 'Q1' }],
    },
    {
      id: 'close',
      role: 'closing',
      layoutId: 'closing',
      blocks: [{ id: 'thanks', type: 'text', slot: 'title', text: 'Thanks' }],
    },
  ],
  assets: [],
});

describe('WorkMate presentation deck state', () => {
  it('parses only a minimally valid versioned source', () => {
    expect(parseDeckSpec(serializeDeckSpec(deck()))?.revision).toBe(4);
    expect(parseDeckSpec('{"schemaVersion":2}')).toBeNull();
    expect(
      parseDeckSpec(
        JSON.stringify({ ...deck(), slides: [{ id: 'broken', role: 'cover', layoutId: 'cover' }] })
      )
    ).toBeNull();
    expect(parseDeckSpec('not json')).toBeNull();
  });

  it('rejects revisions that cannot round-trip across all runtimes', () => {
    expect(parseDeckSpec(JSON.stringify({ ...deck(), revision: 1.5 }))).toBeNull();
    expect(parseDeckSpec(JSON.stringify({ ...deck(), revision: Number.MAX_SAFE_INTEGER + 1 }))).toBeNull();
  });

  it('increments revision and preserves the original during an edit', () => {
    const source = deck();
    const edited = updateBlock(source, 'cover', 'title', (block) => {
      block.text = 'Q2';
    });
    expect(edited.revision).toBe(5);
    expect(edited.slides[0].blocks[0].text).toBe('Q2');
    expect(source.slides[0].blocks[0].text).toBe('Q1');
  });

  it('does not advance revision for a missing semantic target', () => {
    const source = deck();
    expect(updateBlock(source, 'cover', 'missing', () => undefined)).toBe(source);
    expect(updateBlock(source, 'missing', 'title', () => undefined)).toBe(source);
  });

  it('accepts asynchronous results only for the revision that started them', () => {
    expect(isCurrentRevision(5, 5)).toBe(true);
    expect(isCurrentRevision(6, 5)).toBe(false);
  });

  it('does not clear a newer dirty revision when an older save finishes', () => {
    expect(canFinalizeSave(6, 5, 6, 5)).toBe(false);
    expect(canFinalizeSave(5, 5, 6, 5)).toBe(false);
    expect(canFinalizeSave(5, 5, 5, 5)).toBe(true);
  });

  it('records uploaded media provenance and clears stale generation metadata', () => {
    const source = {
      ...deck(),
      assets: [
        {
          id: 'hero',
          path: 'old.png',
          type: 'image' as const,
          status: 'ready' as const,
          source: 'generated',
          model: 'image-model',
          promptSummary: 'old prompt',
        },
      ],
    };
    const updated = setAssetReady(source, 'hero', 'quarterly.assets/hero.png');
    expect(updated.assets[0]).toMatchObject({ path: 'quarterly.assets/hero.png', status: 'ready', source: 'upload' });
    expect(updated.assets[0].model).toBeUndefined();
    expect(updated.assets[0].promptSummary).toBeUndefined();
  });

  it('declares a missing asset after a successful upload', () => {
    const updated = setAssetReady(deck(), 'new-asset', 'quarterly.assets/new-asset.jpg');
    expect(updated.assets.at(-1)).toMatchObject({ id: 'new-asset', status: 'ready', type: 'image' });
  });

  it('moves and duplicates slides with stable unique ids', () => {
    const moved = moveSlide(deck(), 0, 1);
    expect(moved.slides.map((slide) => slide.id)).toEqual(['close', 'cover']);
    const copied = duplicateSlide(moved, 'cover');
    expect(copied.slides.map((slide) => slide.id)).toEqual(['close', 'cover', 'cover-copy']);
    expect(copied.slides[2].blocks[0].id).toBe('title-copy');
  });

  it('ignores malformed drag indices', () => {
    const source = deck();
    expect(moveSlide(source, Number.NaN, 1)).toBe(source);
    expect(moveSlide(source, 0.5, 1)).toBe(source);
  });

  it('does not delete the final slide', () => {
    const oneSlide = { ...deck(), slides: [deck().slides[0]] };
    expect(removeSlide(oneSlide, 'cover').slides).toHaveLength(1);
  });

  it('migrates blocks and resets controls when changing semantic layouts', () => {
    const source = deck();
    source.slides[0].controls = { stale: true };
    source.slides[0].blocks.push(
      { id: 'subtitle', type: 'text', slot: 'title', text: 'Detail' },
      { id: 'visual', type: 'image', slot: 'obsolete', assetId: 'hero' },
      { id: 'extra', type: 'metric', slot: 'obsolete-metric', value: '42' }
    );
    const layout = {
      id: 'image-text',
      role: 'content',
      label: 'Image and text',
      slots: [
        { id: 'title', x: 0, y: 0, width: 1, height: 0.2, accepts: ['text' as const] },
        { id: 'body', x: 0, y: 0.2, width: 0.5, height: 0.8, accepts: ['text' as const] },
        { id: 'visual', x: 0.5, y: 0.2, width: 0.5, height: 0.8, accepts: ['image' as const] },
      ],
      controls: [{ id: 'mediaSide', type: 'select' as const, label: 'Media side', defaultValue: 'left' }],
    };

    const changed = changeSlideLayout(source, 'cover', layout);
    expect(changed.revision).toBe(5);
    expect(changed.slides[0]).toMatchObject({
      layoutId: 'image-text',
      role: 'content',
      controls: { mediaSide: 'left' },
    });
    expect(changed.slides[0].blocks.map((block) => [block.id, block.slot])).toEqual([
      ['title', 'title'],
      ['subtitle', 'body'],
      ['visual', 'visual'],
      ['extra', undefined],
    ]);
    expect(source.slides[0].layoutId).toBe('cover');
  });

  it('does not revise a missing or unchanged layout target', () => {
    const source = deck();
    const coverLayout = { id: 'cover', role: 'cover', label: 'Cover', slots: [], controls: [] };
    expect(changeSlideLayout(source, 'missing', coverLayout)).toBe(source);
    expect(changeSlideLayout(source, 'cover', coverLayout)).toBe(source);
  });

  it('applies semantic controls to shared layout geometry', () => {
    const comparison = {
      id: 'comparison',
      role: 'comparison',
      label: 'Comparison',
      slots: [
        { id: 'left', x: 0.06, y: 0.2, width: 0.41, height: 0.6, accepts: ['text' as const] },
        { id: 'right', x: 0.53, y: 0.2, width: 0.41, height: 0.6, accepts: ['text' as const] },
      ],
      controls: [],
    };
    const slide = { ...deck().slides[0], layoutId: 'comparison', controls: { balance: 65 } };
    const slots = resolveLayoutSlots(comparison, slide);
    expect(slots[0].width).toBeGreaterThan(slots[1].width);

    const imageLayout = {
      ...comparison,
      id: 'image-text',
      slots: [{ id: 'visual', x: 0.04, y: 0.06, width: 0.5, height: 0.88, accepts: ['image' as const] }],
    };
    expect(resolveLayoutSlots(imageLayout, { ...slide, controls: { mediaSide: 'right' } })[0].x).toBeCloseTo(0.46);
  });

  it('resolves project assets beside the deck without exposing an absolute path', () => {
    expect(
      resolveAssetFileRef(
        { kind: 'project', pe_id: 'pe-1', relative_path: 'reports/q1.workmate-deck.json' },
        undefined,
        'q1.assets/hero.png'
      )
    ).toEqual({ kind: 'project', pe_id: 'pe-1', relative_path: 'reports/q1.assets/hero.png' });
  });

  it('resolves local Windows asset paths and rejects traversal', () => {
    expect(
      resolveAssetFileRef({ kind: 'local', path: 'C:\\reports\\q1.workmate-deck.json' }, undefined, 'q1.assets/hero.png')
    ).toEqual({ kind: 'local', path: 'C:\\reports\\q1.assets\\hero.png' });
    expect(resolveAssetFileRef(undefined, '/workspace/q1.workmate-deck.json', '../secret.png')).toBeNull();
  });
});
