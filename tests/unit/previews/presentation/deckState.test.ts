import { describe, expect, it } from 'vitest';
import type { DeckSpecV1 } from '@/common/types/office/presentation';
import {
  canFinalizeSave,
  changeSlideLayout,
  confirmOutline,
  duplicateSlide,
  evaluateOutlineGate,
  isCurrentRevision,
  moveSlide,
  parseDeckSpec,
  removeSlide,
  resolveAssetFileRef,
  isSlotVisible,
  resolveLayoutSlots,
  setAssetReady,
  setSlideControl,
  serializeDeckSpec,
  skipPendingMedia,
  slideHasUnresolvedMedia,
  slotVisibilityControlId,
  suggestLayoutAlternatives,
  themeTokenColor,
  themeStripPalette,
  addSlideCandidate,
  removeSlideCandidate,
  remapTheme,
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
      parseDeckSpec(JSON.stringify({ ...deck(), slides: [{ id: 'broken', role: 'cover', layoutId: 'cover' }] }))
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

  it('skips a pending media block and drops the unused asset', () => {
    const source: DeckSpecV1 = {
      ...deck(),
      slides: [
        {
          id: 'cover',
          role: 'cover',
          layoutId: 'cover',
          blocks: [
            { id: 'title', type: 'text', slot: 'title', text: 'Q1' },
            { id: 'hero', type: 'image', slot: 'media', assetId: 'hero' },
          ],
        },
      ],
      assets: [{ id: 'hero', path: 'quarterly.assets/hero.png', type: 'image', status: 'pending' }],
    };
    expect(slideHasUnresolvedMedia(source.slides[0], source.assets)).toBe(true);
    const updated = skipPendingMedia(source, 'cover', 'hero');
    expect(updated.slides[0].blocks.map((block) => block.id)).toEqual(['title']);
    expect(updated.assets).toEqual([]);
    expect(slideHasUnresolvedMedia(updated.slides[0], updated.assets)).toBe(false);
  });

  it('keeps a shared asset when skipping one of several image references', () => {
    const source: DeckSpecV1 = {
      ...deck(),
      slides: [
        {
          id: 'cover',
          role: 'cover',
          layoutId: 'cover',
          blocks: [
            { id: 'hero', type: 'image', slot: 'media', assetId: 'shared' },
            { id: 'thumb', type: 'image', slot: 'thumb', assetId: 'shared' },
          ],
        },
      ],
      assets: [{ id: 'shared', path: 'quarterly.assets/shared.png', type: 'image', status: 'error' }],
    };
    const updated = skipPendingMedia(source, 'cover', 'hero');
    expect(updated.slides[0].blocks.map((block) => block.id)).toEqual(['thumb']);
    expect(updated.assets).toHaveLength(1);
  });

  it('ignores skip for non-image blocks', () => {
    const source = deck();
    expect(skipPendingMedia(source, 'cover', 'title')).toBe(source);
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

  it('migrates blocks and preserves intersecting controls when changing layouts', () => {
    const source = deck();
    source.slides[0].controls = { stale: true, mediaSide: 'right' };
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
      controls: [
        { id: 'mediaSide', type: 'select' as const, label: 'Media side', defaultValue: 'left' },
        { id: 'balance', type: 'range' as const, label: 'Balance', defaultValue: 50 },
      ],
    };

    const changed = changeSlideLayout(source, 'cover', layout);
    expect(changed.revision).toBe(5);
    expect(changed.slides[0]).toMatchObject({
      layoutId: 'image-text',
      role: 'content',
      controls: { mediaSide: 'right', balance: 50 },
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
      resolveAssetFileRef(
        { kind: 'local', path: 'C:\\reports\\q1.workmate-deck.json' },
        undefined,
        'q1.assets/hero.png'
      )
    ).toEqual({ kind: 'local', path: 'C:\\reports\\q1.assets\\hero.png' });
    expect(resolveAssetFileRef(undefined, '/workspace/q1.workmate-deck.json', '../secret.png')).toBeNull();
  });

  it('gates outline confirmation on title, language, and theme', () => {
    const outline = {
      ...deck(),
      stage: 'outline' as const,
      metadata: { title: '', language: '', aspectRatio: '16:9' as const },
      theme: { id: '' },
    };
    expect(evaluateOutlineGate(outline)).toMatchObject({
      canConfirm: false,
      missingRequired: ['title', 'language', 'theme'],
      warnings: ['goal', 'audience'],
    });

    const readyMeta = {
      ...deck(),
      stage: 'outline' as const,
      metadata: { title: 'Q1', language: 'en-US', aspectRatio: '16:9' as const, goal: 'Align', audience: 'Execs' },
      theme: { id: 'business-light' },
    };
    expect(evaluateOutlineGate(readyMeta).canConfirm).toBe(true);
    expect(confirmOutline(readyMeta).stage).toBe('ready');
    expect(confirmOutline(readyMeta).revision).toBe(5);
    expect(confirmOutline(outline)).toBe(outline);
    expect(confirmOutline({ ...readyMeta, stage: 'ready' })).toEqual({ ...readyMeta, stage: 'ready' });
  });

  it('warns when goal or audience is empty but still allows confirm', () => {
    const outline = {
      ...deck(),
      stage: 'outline' as const,
      metadata: { title: 'Q1', language: 'en-US', aspectRatio: '16:9' as const },
      theme: { id: 'business-light' },
    };
    const gate = evaluateOutlineGate(outline);
    expect(gate.canConfirm).toBe(true);
    expect(gate.warnings).toEqual(['goal', 'audience']);
    expect(confirmOutline(outline).stage).toBe('ready');
  });

  it('writes layout control values onto slide.controls', () => {
    const source = deck();
    const toggled = setSlideControl(source, 'cover', 'showInsight', false);
    expect(toggled.slides[0].controls).toEqual({ showInsight: false });
    const ranged = setSlideControl(toggled, 'cover', 'balance', 60);
    expect(ranged.slides[0].controls).toEqual({ showInsight: false, balance: 60 });
    const sided = setSlideControl(ranged, 'cover', 'mediaSide', 'right');
    expect(sided.slides[0].controls).toEqual({ showInsight: false, balance: 60, mediaSide: 'right' });
    expect(source.slides[0].controls).toBeUndefined();
  });

  it('normalizes catalog theme token colors for swatches', () => {
    expect(themeTokenColor({ background: 'F7F8FA', accent: '#246BFD' }, 'background')).toBe('#F7F8FA');
    expect(themeTokenColor({ background: 'F7F8FA', accent: '#246BFD' }, 'accent')).toBe('#246BFD');
    expect(themeTokenColor(undefined, 'background')).toBeUndefined();
    expect(themeTokenColor({ background: '  ' }, 'background')).toBeUndefined();
  });

  it('suggests same-role layout alternatives with the current layout first', () => {
    const layouts = [
      { id: 'metrics', role: 'metrics', label: 'Metrics', slots: [], controls: [] },
      { id: 'kpi-trio', role: 'metrics', label: 'KPI trio', slots: [], controls: [] },
      { id: 'metrics-row-4', role: 'metrics', label: 'Metrics row', slots: [], controls: [] },
      { id: 'cover', role: 'cover', label: 'Cover', slots: [], controls: [] },
    ];
    expect(suggestLayoutAlternatives(layouts, 'kpi-trio', 'metrics', 4).map((layout) => layout.id)).toEqual([
      'kpi-trio',
      'metrics',
      'metrics-row-4',
    ]);
  });

  it('packs moduleCount slots and hides overflow modules like OfficeCLI', () => {
    const metrics = {
      id: 'metrics',
      role: 'metrics',
      label: 'Metrics',
      slots: [
        { id: 'title', x: 0.06, y: 0.08, width: 0.88, height: 0.1, accepts: ['text' as const] },
        { id: 'metric1', x: 0.06, y: 0.28, width: 0.28, height: 0.5, accepts: ['metric' as const] },
        { id: 'metric2', x: 0.36, y: 0.28, width: 0.28, height: 0.5, accepts: ['metric' as const] },
        { id: 'metric3', x: 0.66, y: 0.28, width: 0.28, height: 0.5, accepts: ['metric' as const] },
      ],
      controls: [],
    };
    const slide = { ...deck().slides[0], layoutId: 'metrics', controls: { moduleCount: 2 } };
    const slots = resolveLayoutSlots(metrics, slide);
    expect(slots.map((slot) => slot.id)).toEqual(['title', 'metric1', 'metric2']);
    expect(slots[1].width).toBeCloseTo((0.88 - 0.03) / 2);
    expect(slots[2].x).toBeCloseTo(0.06 + slots[1].width + 0.03);
  });

  it('mirrors OfficeCLI 1.0.156 packing ids for mediaSide and non-row packs', () => {
    const banner = {
      id: 'cover-banner',
      role: 'cover',
      label: 'Cover banner',
      slots: [{ id: 'visual', x: 0.04, y: 0.06, width: 0.5, height: 0.88, accepts: ['image' as const] }],
      controls: [],
    };
    expect(
      resolveLayoutSlots(banner, { ...deck().slides[0], layoutId: 'cover-banner', controls: { mediaSide: 'right' } })[0]
        .x
    ).toBeCloseTo(0.46);

    const gallery = {
      id: 'gallery-three',
      role: 'gallery',
      label: 'Gallery three',
      slots: [
        { id: 'visual1', x: 0.06, y: 0.2, width: 0.28, height: 0.5, accepts: ['image' as const] },
        { id: 'visual2', x: 0.36, y: 0.2, width: 0.28, height: 0.5, accepts: ['image' as const] },
        { id: 'visual3', x: 0.66, y: 0.2, width: 0.28, height: 0.5, accepts: ['image' as const] },
      ],
      controls: [],
    };
    const kept = resolveLayoutSlots(gallery, {
      ...deck().slides[0],
      layoutId: 'gallery-three',
      controls: { moduleCount: 2 },
    });
    expect(kept.map((slot) => slot.id)).toEqual(['visual1', 'visual2']);
    expect(kept[0].x).toBeCloseTo(0.06);
    expect(kept[0].width).toBeCloseTo(0.28);
  });

  it('honors showInsight optional slot toggles for chart layouts', () => {
    const chart = {
      id: 'chart',
      role: 'chart',
      label: 'Chart',
      slots: [
        { id: 'chart', x: 0.06, y: 0.2, width: 0.58, height: 0.65, accepts: ['chart' as const] },
        { id: 'insight', x: 0.7, y: 0.2, width: 0.24, height: 0.65, accepts: ['text' as const] },
      ],
      controls: [],
    };
    const hidden = resolveLayoutSlots(chart, {
      ...deck().slides[0],
      layoutId: 'chart',
      controls: { showInsight: false },
    });
    expect(hidden.map((slot) => slot.id)).toEqual(['chart']);
    expect(hidden[0].width).toBeCloseTo(0.88);
  });

  it('honors generic slot.<id>.visible toggles and prefers them over showInsight', () => {
    expect(slotVisibilityControlId('metric2')).toBe('slot.metric2.visible');
    expect(isSlotVisible({ 'slot.insight.visible': false, showInsight: true }, 'insight')).toBe(false);
    expect(isSlotVisible({ showInsight: false }, 'insight')).toBe(false);
    expect(isSlotVisible({}, 'insight')).toBe(true);

    const chart = {
      id: 'chart',
      role: 'chart',
      label: 'Chart',
      slots: [
        { id: 'chart', x: 0.06, y: 0.2, width: 0.58, height: 0.65, accepts: ['chart' as const] },
        {
          id: 'insight',
          x: 0.7,
          y: 0.2,
          width: 0.24,
          height: 0.65,
          accepts: ['text' as const],
          toggleable: true,
        },
      ],
      controls: [],
    };
    const hidden = resolveLayoutSlots(chart, {
      ...deck().slides[0],
      layoutId: 'chart',
      controls: { 'slot.insight.visible': false },
    });
    expect(hidden.map((slot) => slot.id)).toEqual(['chart']);
    expect(hidden[0].width).toBeCloseTo(0.88);
  });

  it('reflows module packs when a middle slot is hidden via slot.visible', () => {
    const metrics = {
      id: 'metrics',
      role: 'metrics',
      label: 'Metrics',
      slots: [
        { id: 'title', x: 0.06, y: 0.08, width: 0.88, height: 0.1, accepts: ['text' as const] },
        { id: 'metric1', x: 0.06, y: 0.28, width: 0.28, height: 0.5, accepts: ['metric' as const], toggleable: true },
        { id: 'metric2', x: 0.36, y: 0.28, width: 0.28, height: 0.5, accepts: ['metric' as const], toggleable: true },
        { id: 'metric3', x: 0.66, y: 0.28, width: 0.28, height: 0.5, accepts: ['metric' as const], toggleable: true },
      ],
      controls: [],
    };
    const slots = resolveLayoutSlots(metrics, {
      ...deck().slides[0],
      layoutId: 'metrics',
      controls: { moduleCount: 3, 'slot.metric2.visible': false },
    });
    expect(slots.map((slot) => slot.id)).toEqual(['title', 'metric1', 'metric3']);
    expect(slots[1].width).toBeCloseTo((0.88 - 0.03) / 2);
    expect(slots[2].x).toBeCloseTo(0.06 + slots[1].width + 0.03);
  });

  it('preserves intersecting slot visibility controls when changing layouts', () => {
    const source = deck();
    source.slides[0].controls = {
      'slot.metric2.visible': false,
      'slot.insight.visible': false,
      stale: true,
    };
    const layout = {
      id: 'metrics',
      role: 'metrics',
      label: 'Metrics',
      slots: [
        { id: 'metric1', x: 0, y: 0, width: 0.3, height: 0.4, accepts: ['metric' as const], toggleable: true },
        { id: 'metric2', x: 0.35, y: 0, width: 0.3, height: 0.4, accepts: ['metric' as const], toggleable: true },
        { id: 'metric3', x: 0.7, y: 0, width: 0.3, height: 0.4, accepts: ['metric' as const], toggleable: true },
      ],
      controls: [{ id: 'moduleCount', type: 'range' as const, label: 'Modules', defaultValue: 3, min: 1, max: 3 }],
    };
    const changed = changeSlideLayout(source, 'cover', layout);
    expect(changed.slides[0].controls).toEqual({
      moduleCount: 3,
      'slot.metric2.visible': false,
    });
  });

  it('mirrors OfficeCLI 1.0.158 packing for process-5 and pest balance', () => {
    const process5 = {
      id: 'process-5',
      role: 'process',
      label: 'Five steps',
      slots: [
        { id: 'step1', x: 0.04, y: 0.2, width: 0.17, height: 0.66, accepts: ['text' as const] },
        { id: 'step2', x: 0.23, y: 0.2, width: 0.17, height: 0.66, accepts: ['text' as const] },
        { id: 'step3', x: 0.42, y: 0.2, width: 0.17, height: 0.66, accepts: ['text' as const] },
        { id: 'step4', x: 0.61, y: 0.2, width: 0.17, height: 0.66, accepts: ['text' as const] },
        { id: 'step5', x: 0.8, y: 0.2, width: 0.16, height: 0.66, accepts: ['text' as const] },
      ],
      controls: [],
    };
    const kept = resolveLayoutSlots(process5, {
      ...deck().slides[0],
      layoutId: 'process-5',
      controls: { moduleCount: 3 },
    });
    expect(kept.map((slot) => slot.id)).toEqual(['step1', 'step2', 'step3']);
    expect(kept[0].x).toBeCloseTo(0.04);
    expect(kept[0].width).toBeCloseTo(0.17);

    const pest = {
      id: 'pest',
      role: 'comparison',
      label: 'PEST',
      slots: [
        { id: 'political', x: 0.06, y: 0.18, width: 0.42, height: 0.34, accepts: ['text' as const] },
        { id: 'economic', x: 0.52, y: 0.18, width: 0.42, height: 0.34, accepts: ['text' as const] },
        { id: 'social', x: 0.06, y: 0.56, width: 0.42, height: 0.34, accepts: ['text' as const] },
        { id: 'technological', x: 0.52, y: 0.56, width: 0.42, height: 0.34, accepts: ['text' as const] },
      ],
      controls: [],
    };
    const balanced = resolveLayoutSlots(pest, {
      ...deck().slides[0],
      layoutId: 'pest',
      controls: { balance: 40 },
    });
    expect(balanced.find((slot) => slot.id === 'political')?.width).toBeCloseTo((0.88 - 0.04) * 0.4);
    expect(balanced.find((slot) => slot.id === 'economic')?.x).toBeCloseTo(0.06 + (0.88 - 0.04) * 0.4 + 0.04);
  });

  it('ranks layout alternatives with capacity-aware hints', () => {
    const layouts = [
      {
        id: 'metrics',
        role: 'metrics',
        label: 'Metrics',
        slots: [
          { id: 'metric1', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric2', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric3', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
        ],
        controls: [],
      },
      {
        id: 'metrics-row-4',
        role: 'metrics',
        label: 'Row4',
        slots: [
          { id: 'metric1', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric2', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric3', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric4', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
        ],
        controls: [],
      },
      {
        id: 'chart',
        role: 'metrics',
        label: 'Chart',
        slots: [{ id: 'chart', x: 0, y: 0, width: 0.5, height: 0.5, accepts: ['chart' as const] }],
        controls: [],
      },
    ];
    const ranked = suggestLayoutAlternatives(layouts, 'metrics', 'metrics', 3, { itemCount: 4, hasChart: true });
    expect(ranked[0].id).toBe('metrics');
    expect(ranked.slice(1).map((layout) => layout.id)).toEqual(['chart', 'metrics-row-4']);
  });

  it('prefers DeckSpec candidates[] before capacity-ranked same-role layouts', () => {
    const layouts = [
      {
        id: 'metrics',
        role: 'metrics',
        label: 'Metrics',
        slots: [
          { id: 'metric1', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric2', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric3', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
        ],
        controls: [],
      },
      {
        id: 'metrics-row-4',
        role: 'metrics',
        label: 'Row4',
        slots: [
          { id: 'metric1', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric2', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric3', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
          { id: 'metric4', x: 0, y: 0, width: 0.2, height: 0.2, accepts: ['metric' as const] },
        ],
        controls: [],
      },
      {
        id: 'chart',
        role: 'metrics',
        label: 'Chart',
        slots: [{ id: 'chart', x: 0, y: 0, width: 0.5, height: 0.5, accepts: ['chart' as const] }],
        controls: [],
      },
    ];
    const ranked = suggestLayoutAlternatives(layouts, 'metrics', 'metrics', 3, { itemCount: 4, hasChart: true }, [
      'metrics-row-4',
      'missing-layout',
    ]);
    expect(ranked.map((layout) => layout.id)).toEqual(['metrics', 'metrics-row-4', 'chart']);
  });

  it('adds and removes slides[].candidates without changing layoutId (export uses layoutId only)', () => {
    const base = deck();
    const pinned = addSlideCandidate(base, 'cover', 'metrics-row-4');
    expect(pinned.slides[0].layoutId).toBe('cover');
    expect(pinned.slides[0].candidates).toEqual(['metrics-row-4']);
    const again = addSlideCandidate(pinned, 'cover', 'metrics-row-4');
    expect(again).toBe(pinned);
    const cleared = removeSlideCandidate(pinned, 'cover', 'metrics-row-4');
    expect(cleared.slides[0].layoutId).toBe('cover');
    expect(cleared.slides[0].candidates).toBeUndefined();
  });

  it('builds original WorkMate theme strip palettes from catalog tokens', () => {
    expect(themeStripPalette({ background: '0B1220', surface: '152238', accent: 'C4A35A', text: 'F8FAFC' })).toEqual({
      background: '#0B1220',
      surface: '#152238',
      accent: '#C4A35A',
      text: '#F8FAFC',
    });
  });

  it('remaps theme id, writes extensions.themeRemap, and pins candidates', () => {
    const catalog = {
      themes: [
        {
          id: 'business-light',
          label: 'Business Light',
          tokens: { background: 'F7F8FA', surface: 'FFFFFF', text: '172033', accent: '246BFD' },
        },
        {
          id: 'csbu-workmate-night',
          label: 'Night',
          tokens: { background: '0E0E0E', surface: '1A1A1A', text: 'F2F3F5', accent: '4D9FFF' },
        },
      ],
      layouts: [
        {
          id: 'cover',
          role: 'cover',
          label: 'Cover',
          slots: [{ id: 'title', x: 0, y: 0, width: 1, height: 1, accepts: ['text' as const] }],
          controls: [],
        },
        {
          id: 'cover-split',
          role: 'cover',
          label: 'Cover Split',
          slots: [
            { id: 'title', x: 0, y: 0, width: 0.5, height: 1, accepts: ['text' as const] },
            { id: 'visual', x: 0.5, y: 0, width: 0.5, height: 1, accepts: ['image' as const] },
          ],
          controls: [],
        },
        {
          id: 'closing',
          role: 'closing',
          label: 'Closing',
          slots: [{ id: 'title', x: 0, y: 0, width: 1, height: 1, accepts: ['text' as const] }],
          controls: [],
        },
      ],
    };
    const { spec: next, report } = remapTheme(deck(), 'csbu-workmate-night', catalog);
    expect(next.theme.id).toBe('csbu-workmate-night');
    expect(next.theme.mode).toBe('dark');
    expect(report.modeChange).toBe('light->dark');
    expect(next.extensions?.themeRemap).toBeTruthy();
    expect(next.revision).toBe(5);
  });
});
