import type { ChatFileRef } from '@/common/types/chatFile';
import type {
  DeckBlock,
  DeckBlockType,
  DeckLayout,
  DeckSlide,
  DeckSlot,
  DeckSpecV1,
  DeckTheme,
} from '@/common/types/office/presentation';

export const MAX_DECK_HISTORY = 50;
const BLOCK_TYPES = new Set(['text', 'list', 'metric', 'image', 'chart', 'table', 'timeline', 'quote', 'shape']);

export const isCurrentRevision = (currentRevision: number | undefined, expectedRevision: number): boolean =>
  currentRevision === expectedRevision;

export const canFinalizeSave = (
  currentRevision: number | undefined,
  expectedRevision: number,
  dirtyRevision: number | undefined,
  savingRevision: number | undefined
): boolean => isCurrentRevision(currentRevision, expectedRevision) && dirtyRevision === savingRevision;

const isBlock = (value: unknown): value is DeckBlock => {
  if (!value || typeof value !== 'object') return false;
  const block = value as Partial<DeckBlock>;
  return typeof block.id === 'string' && typeof block.type === 'string' && BLOCK_TYPES.has(block.type);
};

const isSlide = (value: unknown): value is DeckSlide => {
  if (!value || typeof value !== 'object') return false;
  const slide = value as Partial<DeckSlide>;
  return (
    typeof slide.id === 'string' &&
    typeof slide.role === 'string' &&
    typeof slide.layoutId === 'string' &&
    Array.isArray(slide.blocks) &&
    slide.blocks.every(isBlock)
  );
};

export const parseDeckSpec = (content: string): DeckSpecV1 | null => {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object') return null;
    const spec = value as Partial<DeckSpecV1>;
    if (
      spec.schemaVersion !== 1 ||
      typeof spec.revision !== 'number' ||
      !Number.isSafeInteger(spec.revision) ||
      spec.revision < 0 ||
      (spec.stage !== 'outline' && spec.stage !== 'ready') ||
      !spec.metadata ||
      typeof spec.metadata.title !== 'string' ||
      typeof spec.metadata.language !== 'string' ||
      spec.metadata.aspectRatio !== '16:9' ||
      !spec.theme ||
      typeof spec.theme.id !== 'string' ||
      !Array.isArray(spec.slides) ||
      !spec.slides.every(isSlide) ||
      !Array.isArray(spec.assets) ||
      !spec.assets.every(
        (asset) =>
          asset &&
          typeof asset === 'object' &&
          typeof asset.id === 'string' &&
          typeof asset.path === 'string' &&
          asset.type === 'image' &&
          ['pending', 'ready', 'error'].includes(asset.status)
      )
    ) {
      return null;
    }
    return spec as DeckSpecV1;
  } catch {
    return null;
  }
};

export const serializeDeckSpec = (spec: DeckSpecV1): string => `${JSON.stringify(spec, null, 2)}\n`;

export const resolveAssetFileRef = (
  deckRef: ChatFileRef | undefined,
  deckPath: string | undefined,
  assetPath: string
): ChatFileRef | null => {
  const normalizedAsset = assetPath.replaceAll('\\', '/');
  const segments = normalizedAsset.split('/').filter(Boolean);
  if (
    !segments.length ||
    segments.includes('..') ||
    normalizedAsset.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalizedAsset) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(normalizedAsset)
  ) {
    return null;
  }
  if (deckRef?.kind === 'project') {
    const deckRelative = deckRef.relative_path.replaceAll('\\', '/');
    const separator = deckRelative.lastIndexOf('/');
    const parent = separator >= 0 ? deckRelative.slice(0, separator + 1) : '';
    return { kind: 'project', pe_id: deckRef.pe_id, relative_path: `${parent}${segments.join('/')}` };
  }
  const sourcePath = deckRef?.kind === 'local' || deckRef?.kind === 'upload' ? deckRef.path : deckPath;
  if (!sourcePath) return null;
  const slash = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
  if (slash < 0) return null;
  const separator = sourcePath.includes('\\') ? '\\' : '/';
  const path = `${sourcePath.slice(0, slash + 1)}${segments.join(separator)}`;
  return deckRef?.kind === 'upload' ? { kind: 'upload', path } : { kind: 'local', path };
};

const controlNumber = (controls: Record<string, unknown>, id: string, fallback: number): number => {
  const value = controls[id];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const controlString = (controls: Record<string, unknown>, id: string, fallback: string): string => {
  const value = controls[id];
  return typeof value === 'string' ? value : fallback;
};

const controlBool = (controls: Record<string, unknown>, id: string, fallback: boolean): boolean => {
  const value = controls[id];
  return typeof value === 'boolean' ? value : fallback;
};

/** Control id pattern for generic per-slot visibility (mirrors OfficeCLI 1.0.157). */
export const slotVisibilityControlId = (slotId: string): string => `slot.${slotId}.visible`;

/**
 * Generic per-slot visibility from slide.controls[`slot.<id>.visible`].
 * Falls back to legacy showInsight for the insight slot.
 */
export const isSlotVisible = (controls: Record<string, unknown> | undefined, slotId: string): boolean => {
  const map = controls ?? {};
  const key = slotVisibilityControlId(slotId);
  if (Object.prototype.hasOwnProperty.call(map, key) && typeof map[key] === 'boolean') {
    return map[key] as boolean;
  }
  if (slotId === 'insight') return controlBool(map, 'showInsight', true);
  if (slotId === 'callout') return controlBool(map, 'showCallout', true);
  if (slotId === 'footer') return controlBool(map, 'showFooter', true);
  return true;
};

const MODULE_SLOT_IDS: Record<string, string[]> = {
  metrics: ['metric1', 'metric2', 'metric3'],
  'kpi-trio': ['metric1', 'metric2', 'metric3'],
  'cover-kpi-strip': ['metric1', 'metric2', 'metric3'],
  'metrics-callout': ['metric1', 'metric2', 'metric3'],
  'kpi-radar-sidecar': ['metric1', 'metric2', 'metric3'],
  'chart-with-kpis': ['metric1', 'metric2', 'metric3'],
  'image-stats': ['metric1', 'metric2', 'metric3'],
  'context-facts': ['metric1', 'metric2', 'metric3'],
  'case-metrics': ['metric1', 'metric2', 'metric3'],
  'result-metrics': ['metric1', 'metric2', 'metric3'],
  'metrics-with-footer': ['metric1', 'metric2', 'metric3'],
  'closing-cta-metrics': ['metric1', 'metric2', 'metric3'],
  'metrics-duo': ['metric1', 'metric2'],
  'quote-metrics': ['metric1', 'metric2'],
  'result-summary': ['metric1', 'metric2'],
  'cover-dual-metric': ['metric1', 'metric2'],
  'metrics-callout-side': ['metric1', 'metric2'],
  'case-quote-result': ['metric1', 'metric2'],
  'metrics-row-4': ['metric1', 'metric2', 'metric3', 'metric4'],
  'metrics-strip': ['metric1', 'metric2', 'metric3', 'metric4'],
  'kpi-sparkline-row': ['metric1', 'metric2', 'metric3', 'metric4'],
  'context-metrics-strip': ['metric1', 'metric2', 'metric3', 'metric4'],
  'metrics-grid-compact': ['metric1', 'metric2', 'metric3', 'metric4', 'metric5', 'metric6'],
  cards: ['card1', 'card2', 'card3'],
  'agenda-cards': ['card1', 'card2', 'card3'],
  'toc-cards': ['card1', 'card2', 'card3'],
  'risks-top3': ['card1', 'card2', 'card3'],
  'observation-callouts': ['card1', 'card2', 'card3'],
  'actions-priority': ['card1', 'card2', 'card3'],
  'relationship-map-lite': ['card1', 'card2', 'card3'],
  'breakdown-icon-row': ['card1', 'card2', 'card3'],
  'risks-priority-cards': ['card1', 'card2', 'card3'],
  'result-three-up': ['card1', 'card2', 'card3'],
  'cards-four': ['card1', 'card2', 'card3', 'card4'],
  'team-org-lite': ['card1', 'card2', 'card3', 'card4'],
  'breakdown-numbered-cards': ['card1', 'card2', 'card3', 'card4'],
  'breakdown-quad': ['card1', 'card2', 'card3', 'card4'],
  'observation-grid': ['card1', 'card2', 'card3', 'card4'],
  'relationship-hub': ['card1', 'card2', 'card3', 'card4'],
  'three-column': ['col1', 'col2', 'col3'],
  'comparison-three': ['col1', 'col2', 'col3'],
  'breakdown-pillars': ['col1', 'col2', 'col3'],
  'option-score': ['col1', 'col2', 'col3'],
  'process-swimlane-lite': ['col1', 'col2', 'col3'],
  'team-roles': ['col1', 'col2', 'col3'],
  'distribution-segments': ['col1', 'col2', 'col3'],
  'stakeholder-grid': ['col1', 'col2', 'col3'],
  'team-roles-footer': ['col1', 'col2', 'col3'],
  'case-three-phase': ['col1', 'col2', 'col3'],
  'process-lanes-2': ['col1', 'col2', 'col3'],
  'option-cards-4': ['col1', 'col2', 'col3', 'col4'],
  'comparison-four': ['col1', 'col2', 'col3', 'col4'],
  'comparison-columns-4': ['col1', 'col2', 'col3', 'col4'],
  'distribution-four-seg': ['col1', 'col2', 'col3', 'col4'],
  'stakeholder-map-4': ['col1', 'col2', 'col3', 'col4'],
  'process-steps': ['step1', 'step2', 'step3', 'step4'],
  'process-horizontal': ['step1', 'step2', 'step3', 'step4'],
  'cycle-4': ['step1', 'step2', 'step3', 'step4'],
  'agenda-timeline': ['step1', 'step2', 'step3', 'step4'],
  'roadmap-milestones': ['step1', 'step2', 'step3', 'step4'],
  'process-vertical': ['step1', 'step2', 'step3', 'step4'],
  'toc-timeline': ['step1', 'step2', 'step3', 'step4'],
  'journey-steps': ['step1', 'step2', 'step3', 'step4'],
  'closing-roadmap': ['step1', 'step2', 'step3', 'step4'],
  'context-timeline': ['step1', 'step2', 'step3', 'step4'],
  'double-diamond': ['step1', 'step2', 'step3', 'step4'],
  'process-checkpoint': ['step1', 'step2', 'step3', 'step4'],
  'case-timeline': ['step1', 'step2', 'step3', 'step4'],
  'chapter-progress': ['step1', 'step2', 'step3', 'step4'],
  'process-5': ['step1', 'step2', 'step3', 'step4', 'step5'],
  'process-vertical-5': ['step1', 'step2', 'step3', 'step4', 'step5'],
  'process-6': ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'],
  team: ['member1', 'member2', 'member3', 'member4'],
  'team-row': ['member1', 'member2', 'member3', 'member4'],
  'team-grid': ['member1', 'member2', 'member3', 'member4'],
  'team-cards-5': ['member1', 'member2', 'member3', 'member4', 'member5'],
  'team-lead-grid': ['member1', 'member2', 'member3', 'member4', 'member5'],
  'closing-contacts': ['member1', 'member2', 'member3'],
  'closing-contacts-footer': ['member1', 'member2', 'member3'],
  funnel: ['stage1', 'stage2', 'stage3', 'stage4'],
  'funnel-wide': ['stage1', 'stage2', 'stage3', 'stage4'],
  'pipeline-stages': ['stage1', 'stage2', 'stage3', 'stage4'],
  'gallery-two': ['visual1', 'visual2'],
  'gallery-three': ['visual1', 'visual2', 'visual3'],
  'image-three-up': ['visual1', 'visual2', 'visual3'],
  'gallery-caption-row': ['visual1', 'visual2', 'visual3'],
  'image-mosaic-4': ['visual1', 'visual2', 'visual3', 'visual4'],
  'five-forces': ['rivalry', 'entrants', 'substitutes', 'suppliers', 'buyers'],
};

const densityPackMetrics = (controls: Record<string, unknown>): { start: number; total: number; gap: number } => {
  switch (controlString(controls, 'density', 'comfortable')) {
    case 'compact':
      return { start: 0.04, total: 0.92, gap: 0.02 };
    case 'spacious':
      return { start: 0.08, total: 0.84, gap: 0.05 };
    default:
      return { start: 0.06, total: 0.88, gap: 0.03 };
  }
};

const packModuleSlots = (layoutId: string, slot: DeckSlot, controls: Record<string, unknown>): DeckSlot => {
  const moduleIds = MODULE_SLOT_IDS[layoutId];
  if (!moduleIds) return slot;
  const index = moduleIds.indexOf(slot.id);
  if (index < 0) return slot;
  const countControl =
    moduleIds[0]?.startsWith('col') && Object.prototype.hasOwnProperty.call(controls, 'columns')
      ? 'columns'
      : 'moduleCount';
  const count = Math.min(
    moduleIds.length,
    Math.max(1, Math.round(controlNumber(controls, countControl, moduleIds.length)))
  );
  const visibleIds = moduleIds.slice(0, count).filter((id) => isSlotVisible(controls, id));
  const visibleIndex = visibleIds.indexOf(slot.id);
  if (visibleIndex < 0) return { ...slot, width: 0, height: 0 };
  // Keep authored geometry for non-row packs (funnel stages, 2x2 cycle, gallery, vertical/grid).
  if (
    layoutId === 'funnel' ||
    layoutId === 'funnel-wide' ||
    layoutId === 'cycle-4' ||
    layoutId === 'gallery-two' ||
    layoutId === 'gallery-three' ||
    layoutId === 'process-vertical' ||
    layoutId === 'cards-four' ||
    layoutId === 'option-cards-4' ||
    layoutId === 'comparison-four' ||
    layoutId === 'pipeline-stages' ||
    layoutId === 'image-mosaic-4' ||
    layoutId === 'team-org-lite' ||
    layoutId === 'five-forces' ||
    layoutId === 'kpi-radar-sidecar' ||
    layoutId === 'image-stats' ||
    layoutId === 'case-metrics' ||
    layoutId === 'process-5' ||
    layoutId === 'chart-with-kpis' ||
    layoutId === 'metrics-callout' ||
    layoutId === 'context-facts' ||
    layoutId === 'relationship-map-lite' ||
    layoutId === 'quote-metrics' ||
    layoutId === 'result-summary' ||
    layoutId === 'breakdown-quad' ||
    layoutId === 'observation-grid' ||
    layoutId === 'relationship-hub' ||
    layoutId === 'team-lead-grid' ||
    layoutId === 'metrics-grid-compact' ||
    layoutId === 'process-vertical-5' ||
    layoutId === 'cover-dual-metric' ||
    layoutId === 'case-quote-result' ||
    layoutId === 'metrics-callout-side'
  ) {
    return slot;
  }
  const { start, total, gap } = densityPackMetrics(controls);
  const packCount = Math.max(1, visibleIds.length);
  const usable = total - gap * Math.max(0, packCount - 1);
  const width = usable / packCount;
  return { ...slot, x: start + visibleIndex * (width + gap), width };
};

/** Mirror OfficeCLI DeckService.AdjustSlot / PackModuleSlots for Studio preview parity. */
export const resolveLayoutSlots = (layout: DeckLayout, slide: DeckSlide): DeckSlot[] => {
  const controls = slide.controls ?? {};
  const insightVisible = isSlotVisible(controls, 'insight');
  return layout.slots
    .filter((slot) => isSlotVisible(controls, slot.id))
    .map((slot) => {
      if (
        (layout.id === 'image-text' ||
          layout.id === 'two-column' ||
          layout.id === 'cover-split' ||
          layout.id === 'quote-split' ||
          layout.id === 'cover-banner' ||
          layout.id === 'image-left-bullets' ||
          layout.id === 'cover-dark-band' ||
          layout.id === 'image-quote' ||
          layout.id === 'image-stats' ||
          layout.id === 'cover-photo-stack' ||
          layout.id === 'image-callout-overlay' ||
          layout.id === 'image-split-caption') &&
        controlString(controls, 'mediaSide', 'left') === 'right'
      ) {
        return { ...slot, x: 1 - slot.x - slot.width };
      }

      if (!insightVisible) {
        if (
          (layout.id === 'chart' ||
            layout.id === 'chart-radar' ||
            layout.id === 'chart-insight-right' ||
            layout.id === 'chart-waterfall' ||
            layout.id === 'chart-funnel' ||
            layout.id === 'distribution-pie-focus' ||
            layout.id === 'result-chart-proof') &&
          slot.id === 'chart'
        ) {
          return { ...slot, x: 0.06, width: 0.88 };
        }
        if ((layout.id === 'data-table' || layout.id === 'table-callouts') && slot.id === 'table') {
          return { ...slot, x: 0.06, width: 0.88 };
        }
        if (
          (layout.id === 'risk-matrix-simple' || layout.id === 'risks-matrix' || layout.id === 'decision-matrix') &&
          slot.id === 'matrix'
        ) {
          return { ...slot, x: 0.06, width: 0.88 };
        }
      }

      if (
        (layout.id === 'comparison' ||
          layout.id === 'two-column' ||
          layout.id === 'toc' ||
          layout.id === 'before-after' ||
          layout.id === 'pros-cons' ||
          layout.id === 'mitigation-plan' ||
          layout.id === 'bullets-two' ||
          layout.id === 'metrics-highlight' ||
          layout.id === 'chart-compare' ||
          layout.id === 'toc-two-column' ||
          layout.id === 'vs-scorecard' ||
          layout.id === 'statement-split' ||
          layout.id === 'image-left-bullets' ||
          layout.id === 'feature-vs' ||
          layout.id === 'cost-benefit' ||
          layout.id === 'kpi-vs-target' ||
          layout.id === 'side-by-side-kpis' ||
          layout.id === 'closing-split-cta' ||
          layout.id === 'risks-mitigation-grid' ||
          layout.id === 'result-before-after' ||
          layout.id === 'case-study' ||
          layout.id === 'case-challenge-solution' ||
          layout.id === 'relationship-pairs' ||
          layout.id === 'chart-dual-panel' ||
          layout.id === 'comparison-criteria' ||
          layout.id === 'ask-split-footer' ||
          layout.id === 'risks-two-track' ||
          layout.id === 'context-split-callout' ||
          layout.id === 'actions-two-column' ||
          layout.id === 'trend-dual-charts' ||
          layout.id === 'process-lanes-2' ||
          layout.id === 'bullets-callout') &&
        (slot.id === 'left' ||
          slot.id === 'right' ||
          slot.id === 'kpi' ||
          slot.id === 'support' ||
          slot.id === 'body' ||
          slot.id === 'content' ||
          slot.id === 'callout')
      ) {
        const balance = Math.min(65, Math.max(35, controlNumber(controls, 'balance', 50))) / 100;
        const start = 0.06;
        const gap = 0.06;
        const usable = 0.88 - gap;
        const leftWidth = usable * balance;
        return slot.id === 'left' || slot.id === 'kpi' || slot.id === 'content'
          ? { ...slot, x: start, width: leftWidth }
          : { ...slot, x: start + leftWidth + gap, width: usable - leftWidth };
      }

      if (
        (layout.id === 'comparison-table' ||
          layout.id === 'risk' ||
          layout.id === 'risk-heatmap' ||
          layout.id === 'data-table' ||
          layout.id === 'risk-matrix-simple' ||
          layout.id === 'table-callouts' ||
          layout.id === 'chart-insight-right' ||
          layout.id === 'decision-matrix' ||
          layout.id === 'risks-matrix' ||
          layout.id === 'risks-heatmap-lite' ||
          layout.id === 'context-brief' ||
          layout.id === 'observation-quote-data' ||
          layout.id === 'distribution-pie-focus' ||
          layout.id === 'chart-waterfall' ||
          layout.id === 'chart-funnel') &&
        (slot.id === 'left' ||
          slot.id === 'summary' ||
          slot.id === 'insight' ||
          slot.id === 'table' ||
          slot.id === 'matrix' ||
          slot.id === 'chart' ||
          slot.id === 'body')
      ) {
        if (
          !insightVisible &&
          (layout.id === 'data-table' ||
            layout.id === 'risk-matrix-simple' ||
            layout.id === 'table-callouts' ||
            layout.id === 'chart-insight-right' ||
            layout.id === 'decision-matrix' ||
            layout.id === 'risks-matrix' ||
            layout.id === 'distribution-pie-focus' ||
            layout.id === 'chart-waterfall' ||
            layout.id === 'chart-funnel') &&
          (slot.id === 'table' || slot.id === 'matrix' || slot.id === 'chart')
        ) {
          return { ...slot, x: 0.06, width: 0.88 };
        }
        const balance = Math.min(50, Math.max(25, controlNumber(controls, 'balance', 35))) / 100;
        const start = 0.06;
        const gap = 0.04;
        const usable = 0.88 - gap;
        const leftWidth = usable * balance;
        if (slot.id === 'left' || slot.id === 'summary' || slot.id === 'insight') {
          return { ...slot, x: start, width: leftWidth };
        }
        return { ...slot, x: start + leftWidth + gap, width: usable - leftWidth };
      }

      if (
        (layout.id === 'swot' || layout.id === 'swot-compact') &&
        (slot.id === 'strengths' || slot.id === 'weaknesses' || slot.id === 'opportunities' || slot.id === 'threats')
      ) {
        const balance = Math.min(60, Math.max(40, controlNumber(controls, 'balance', 50))) / 100;
        const start = 0.06;
        const gap = 0.04;
        const usable = 0.88 - gap;
        const leftWidth = usable * balance;
        const isLeft = slot.id === 'strengths' || slot.id === 'opportunities';
        return isLeft
          ? { ...slot, x: start, width: leftWidth }
          : { ...slot, x: start + leftWidth + gap, width: usable - leftWidth };
      }

      if (
        layout.id === 'pest' &&
        (slot.id === 'political' || slot.id === 'economic' || slot.id === 'social' || slot.id === 'technological')
      ) {
        const balance = Math.min(60, Math.max(40, controlNumber(controls, 'balance', 50))) / 100;
        const start = 0.06;
        const gap = 0.04;
        const usable = 0.88 - gap;
        const leftWidth = usable * balance;
        const isLeft = slot.id === 'political' || slot.id === 'social';
        return isLeft
          ? { ...slot, x: start, width: leftWidth }
          : { ...slot, x: start + leftWidth + gap, width: usable - leftWidth };
      }

      return packModuleSlots(layout.id, slot, controls);
    })
    .filter((slot) => slot.width > 0 && slot.height > 0);
};

export type OutlineRequiredField = 'title' | 'language' | 'theme';
export type OutlineWarningField = 'goal' | 'audience';

export type OutlineGateResult = {
  canConfirm: boolean;
  missingRequired: OutlineRequiredField[];
  warnings: OutlineWarningField[];
};

const isBlank = (value: string | undefined): boolean => !value || !value.trim();

/** Whether the outline stage may advance to ready (title/language/theme required). */
export const evaluateOutlineGate = (spec: DeckSpecV1): OutlineGateResult => {
  const missingRequired: OutlineRequiredField[] = [];
  if (isBlank(spec.metadata.title)) missingRequired.push('title');
  if (isBlank(spec.metadata.language)) missingRequired.push('language');
  if (isBlank(spec.theme.id)) missingRequired.push('theme');
  const warnings: OutlineWarningField[] = [];
  if (isBlank(spec.metadata.goal)) warnings.push('goal');
  if (isBlank(spec.metadata.audience)) warnings.push('audience');
  return {
    canConfirm: spec.stage === 'outline' && missingRequired.length === 0,
    missingRequired,
    warnings,
  };
};

/** Advance outline → ready only when required metadata is present. */
export const confirmOutline = (spec: DeckSpecV1): DeckSpecV1 => {
  if (!evaluateOutlineGate(spec).canConfirm) return spec;
  return mutateDeck(spec, (draft) => {
    draft.stage = 'ready';
  });
};

/** Normalize catalog token colors (hex without #) for CSS swatches. */
export const themeTokenColor = (tokens: Record<string, string> | undefined, key: string): string | undefined => {
  const raw = tokens?.[key]?.trim();
  if (!raw) return undefined;
  return raw.startsWith('#') ? raw : `#${raw}`;
};

/** Original CSBU WorkMate theme strip palette (Studio / outline picker; no third-party assets). */
export const themeStripPalette = (
  tokens: Record<string, string> | undefined
): { background: string; surface: string; accent: string; text: string } => ({
  background: themeTokenColor(tokens, 'background') ?? '#D0D5DD',
  surface: themeTokenColor(tokens, 'surface') ?? '#FFFFFF',
  accent: themeTokenColor(tokens, 'accent') ?? '#667085',
  text: themeTokenColor(tokens, 'text') ?? '#111827',
});

/** Pin a preferred alternate layout id on slides[].candidates (export still uses layoutId only). */
export const addSlideCandidate = (spec: DeckSpecV1, slideId: string, layoutId: string): DeckSpecV1 => {
  const id = layoutId.trim();
  if (!id) return spec;
  const slide = spec.slides.find((item) => item.id === slideId);
  if (!slide) return spec;
  if ((slide.candidates ?? []).includes(id)) return spec;
  return updateSlide(spec, slideId, (draft) => {
    draft.candidates = [...(draft.candidates ?? []), id];
  });
};

/** Remove a pinned layout id from slides[].candidates. */
export const removeSlideCandidate = (spec: DeckSpecV1, slideId: string, layoutId: string): DeckSpecV1 => {
  const slide = spec.slides.find((item) => item.id === slideId);
  if (!slide?.candidates?.length || !slide.candidates.includes(layoutId)) return spec;
  return updateSlide(spec, slideId, (draft) => {
    const next = (draft.candidates ?? []).filter((candidate) => candidate !== layoutId);
    draft.candidates = next.length ? next : undefined;
  });
};

export const mutateDeck = (spec: DeckSpecV1, mutation: (draft: DeckSpecV1) => void): DeckSpecV1 => {
  const draft = structuredClone(spec);
  mutation(draft);
  draft.revision = spec.revision + 1;
  return draft;
};

export const moveSlide = (spec: DeckSpecV1, from: number, to: number): DeckSpecV1 =>
  !Number.isInteger(from) ||
  !Number.isInteger(to) ||
  from < 0 ||
  to < 0 ||
  from >= spec.slides.length ||
  to >= spec.slides.length ||
  from === to
    ? spec
    : mutateDeck(spec, (draft) => {
        const [slide] = draft.slides.splice(from, 1);
        if (slide) draft.slides.splice(to, 0, slide);
      });

export const duplicateSlide = (spec: DeckSpecV1, slideId: string): DeckSpecV1 => {
  if (!spec.slides.some((slide) => slide.id === slideId)) return spec;
  return mutateDeck(spec, (draft) => {
    const index = draft.slides.findIndex((slide) => slide.id === slideId);
    const source = draft.slides[index];
    if (!source) return;
    const copy = structuredClone(source);
    copy.id = uniqueId(
      `${copy.id}-copy`,
      draft.slides.map((slide) => slide.id)
    );
    copy.blocks = copy.blocks.map((block) => ({
      ...block,
      id: uniqueId(
        `${block.id}-copy`,
        draft.slides.flatMap((slide) => slide.blocks.map((item) => item.id))
      ),
    }));
    draft.slides.splice(index + 1, 0, copy);
  });
};

export const removeSlide = (spec: DeckSpecV1, slideId: string): DeckSpecV1 => {
  if (spec.slides.length <= 1 || !spec.slides.some((slide) => slide.id === slideId)) return spec;
  return mutateDeck(spec, (draft) => {
    draft.slides = draft.slides.filter((slide) => slide.id !== slideId);
  });
};

export const updateSlide = (spec: DeckSpecV1, slideId: string, update: (slide: DeckSlide) => void): DeckSpecV1 => {
  if (!spec.slides.some((slide) => slide.id === slideId)) return spec;
  return mutateDeck(spec, (draft) => {
    const slide = draft.slides.find((item) => item.id === slideId);
    if (slide) update(slide);
  });
};

export type LayoutSuggestionHints = {
  /** Approximate content modules the slide wants to show (KPIs, cards, steps…). */
  itemCount?: number;
  /** Whether the slide needs a chart-capable slot. */
  hasChart?: boolean;
  /** Whether the slide needs an image/media-capable slot. */
  needsMedia?: boolean;
};

const layoutCapacity = (layout: DeckLayout): number => {
  const moduleIds = MODULE_SLOT_IDS[layout.id];
  if (moduleIds?.length) return moduleIds.length;
  return layout.slots.filter((slot) => slot.id !== 'title' && slot.id !== 'subtitle').length;
};

const layoutAccepts = (layout: DeckLayout, type: DeckBlockType): boolean =>
  layout.slots.some((slot) => slot.accepts.includes(type));

const scoreLayoutAlternative = (layout: DeckLayout, hints?: LayoutSuggestionHints): number => {
  if (!hints) return 0;
  let score = 0;
  if (typeof hints.itemCount === 'number' && Number.isFinite(hints.itemCount)) {
    const capacity = layoutCapacity(layout);
    const delta = Math.abs(capacity - Math.max(1, Math.round(hints.itemCount)));
    score += Math.max(0, 8 - delta * 2);
  }
  if (hints.hasChart) score += layoutAccepts(layout, 'chart') ? 5 : -3;
  if (hints.needsMedia) score += layoutAccepts(layout, 'image') ? 4 : -2;
  return score;
};

/** Same-role layout alternatives for one-click switching in PresentationStudio (CSBU WorkMate). */
export const suggestLayoutAlternatives = (
  layouts: DeckLayout[],
  currentLayoutId: string,
  role: string,
  limit = 4,
  hints?: LayoutSuggestionHints,
  candidateIds?: string[]
): DeckLayout[] => {
  const byId = new Map(layouts.map((layout) => [layout.id, layout]));
  const sameRole = layouts.filter((layout) => layout.role === role);
  const current = sameRole.filter((layout) => layout.id === currentLayoutId);
  const scoredPreferred = sameRole
    .filter((layout) => layout.id !== currentLayoutId)
    .slice()
    .sort((a, b) => {
      const scoreDelta = scoreLayoutAlternative(b, hints) - scoreLayoutAlternative(a, hints);
      if (scoreDelta !== 0) return scoreDelta;
      return a.id.localeCompare(b.id);
    });
  const fromCandidates: DeckLayout[] = [];
  const seen = new Set<string>([currentLayoutId]);
  for (const id of candidateIds ?? []) {
    if (!id || seen.has(id)) continue;
    const layout = byId.get(id);
    if (!layout) continue;
    fromCandidates.push(layout);
    seen.add(id);
  }
  const preferred = [...fromCandidates, ...scoredPreferred.filter((layout) => !seen.has(layout.id))];
  const ordered = [...current, ...preferred];
  return ordered.slice(0, Math.max(1, limit));
};

/** Migrates a slide to a semantic layout; keeps shared control values, drops unknowns. */
export const changeSlideLayout = (spec: DeckSpecV1, slideId: string, layout: DeckLayout): DeckSpecV1 => {
  const source = spec.slides.find((slide) => slide.id === slideId);
  if (!source || source.layoutId === layout.id) return spec;
  return updateSlide(spec, slideId, (slide) => {
    slide.layoutId = layout.id;
    slide.role = layout.role;
    const previous = slide.controls ?? {};
    const nextControls: Record<string, unknown> = Object.fromEntries(
      layout.controls.map((control) => [
        control.id,
        Object.prototype.hasOwnProperty.call(previous, control.id) ? previous[control.id] : control.defaultValue,
      ])
    );
    // Preserve intersecting slot.<id>.visible toggles for toggleable slots on the new layout.
    for (const slot of layout.slots) {
      if (!slot.toggleable) continue;
      const key = slotVisibilityControlId(slot.id);
      if (Object.prototype.hasOwnProperty.call(previous, key)) nextControls[key] = previous[key];
    }
    slide.controls = nextControls;

    const occupied = new Set<string>();
    for (const block of slide.blocks) {
      const compatibleCurrent = layout.slots.find(
        (slot) => slot.id === block.slot && slot.accepts.includes(block.type) && !occupied.has(slot.id)
      );
      if (compatibleCurrent) {
        occupied.add(compatibleCurrent.id);
        continue;
      }
      delete block.slot;
    }
    for (const block of slide.blocks.filter((candidate) => !candidate.slot)) {
      const compatible = layout.slots.find((slot) => slot.accepts.includes(block.type) && !occupied.has(slot.id));
      if (compatible) {
        block.slot = compatible.id;
        occupied.add(compatible.id);
      }
    }
  });
};

export const setSlideControl = (spec: DeckSpecV1, slideId: string, controlId: string, value: unknown): DeckSpecV1 =>
  updateSlide(spec, slideId, (slide) => {
    slide.controls = { ...slide.controls, [controlId]: value };
  });

export const updateBlock = (
  spec: DeckSpecV1,
  slideId: string,
  blockId: string,
  update: (block: DeckBlock) => void
): DeckSpecV1 => {
  const slide = spec.slides.find((item) => item.id === slideId);
  if (!slide?.blocks.some((block) => block.id === blockId)) return spec;
  return updateSlide(spec, slideId, (slideDraft) => {
    const block = slideDraft.blocks.find((item) => item.id === blockId);
    if (block) update(block);
  });
};

export const setAssetReady = (spec: DeckSpecV1, assetId: string, path: string): DeckSpecV1 =>
  mutateDeck(spec, (draft) => {
    const asset = draft.assets.find((item) => item.id === assetId);
    if (asset) {
      asset.path = path;
      asset.status = 'ready';
      asset.source = 'upload';
      delete asset.model;
      delete asset.promptSummary;
      return;
    }
    draft.assets.push({ id: assetId, path, type: 'image', status: 'ready', source: 'upload' });
  });

/** Remove a pending/error image block so export is not blocked; drop unused assets. */
export const skipPendingMedia = (spec: DeckSpecV1, slideId: string, blockId: string): DeckSpecV1 => {
  const slide = spec.slides.find((item) => item.id === slideId);
  const block = slide?.blocks.find((item) => item.id === blockId);
  if (!block || block.type !== 'image') return spec;
  const assetId = block.assetId;
  return mutateDeck(spec, (draft) => {
    const draftSlide = draft.slides.find((item) => item.id === slideId);
    if (!draftSlide) return;
    draftSlide.blocks = draftSlide.blocks.filter((item) => item.id !== blockId);
    if (!assetId) return;
    const stillReferenced = draft.slides.some((item) => item.blocks.some((candidate) => candidate.assetId === assetId));
    if (!stillReferenced) draft.assets = draft.assets.filter((asset) => asset.id !== assetId);
  });
};

export const slideHasUnresolvedMedia = (slide: DeckSlide, assets: DeckSpecV1['assets']): boolean =>
  slide.blocks.some((block) => {
    if (block.type !== 'image' || !block.assetId) return false;
    const asset = assets.find((item) => item.id === block.assetId);
    return asset?.status === 'pending' || asset?.status === 'error';
  });

const uniqueId = (base: string, ids: string[]): string => {
  if (!ids.includes(base)) return base;
  let suffix = 2;
  while (ids.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export type ThemeRemapSlideReport = {
  slideId: string;
  role: string;
  layoutId: string;
  needsRemap: boolean;
  reasons: string[];
  alternatives: string[];
};

export type ThemeRemapReport = {
  fromThemeId: string;
  toThemeId: string;
  modeChange?: string;
  generatedAt: string;
  needsRemapCount: number;
  slides: ThemeRemapSlideReport[];
};

const inferThemeMode = (tokens: Record<string, string> | undefined): 'light' | 'dark' => {
  const raw = tokens?.background?.trim().replace(/^#/, '') ?? '';
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(raw)) return 'light';
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.45 ? 'dark' : 'light';
};

const blockHints = (slide: DeckSlide): LayoutSuggestionHints => ({
  itemCount: Math.max(
    1,
    slide.blocks.filter((block) => block.type === 'metric' || block.type === 'list' || block.type === 'timeline')
      .length || slide.blocks.length
  ),
  hasChart: slide.blocks.some((block) => block.type === 'chart'),
  needsMedia: slide.blocks.some((block) => block.type === 'image' || block.type === 'shape'),
});

/**
 * Change theme.id (CSBU WorkMate), write extensions.themeRemap, and pin same-role
 * alternatives onto slides[].candidates when a remap is advised. Mirrors
 * `officecli deck theme-remap` for Studio.
 */
export const remapTheme = (
  spec: DeckSpecV1,
  toThemeId: string,
  catalog: { themes: DeckTheme[]; layouts: DeckLayout[] },
  options?: { writeReport?: boolean; pinCandidates?: boolean; limit?: number }
): { spec: DeckSpecV1; report: ThemeRemapReport } => {
  const toId = toThemeId.trim();
  const toTheme = catalog.themes.find((theme) => theme.id === toId);
  if (!toTheme || toId === spec.theme.id) {
    return {
      spec,
      report: {
        fromThemeId: spec.theme.id,
        toThemeId: toId || spec.theme.id,
        generatedAt: new Date().toISOString(),
        needsRemapCount: 0,
        slides: [],
      },
    };
  }

  const fromTheme = catalog.themes.find((theme) => theme.id === spec.theme.id);
  const fromMode = inferThemeMode(fromTheme?.tokens);
  const toMode = inferThemeMode(toTheme.tokens);
  const modeChange = fromMode !== toMode ? `${fromMode}->${toMode}` : undefined;
  const limit = Math.max(1, Math.min(options?.limit ?? 5, 20));
  const layoutById = new Map(catalog.layouts.map((layout) => [layout.id, layout]));
  const slides: ThemeRemapSlideReport[] = spec.slides.map((slide) => {
    const known = layoutById.has(slide.layoutId);
    const hints = blockHints(slide);
    const alts = suggestLayoutAlternatives(
      catalog.layouts,
      slide.layoutId,
      slide.role,
      limit + 1,
      hints,
      slide.candidates
    )
      .filter((layout) => layout.id !== slide.layoutId)
      .slice(0, limit);
    const reasons: string[] = [];
    if (!known) reasons.push('unknown_layout');
    if (modeChange) reasons.push('theme_mode_shift');
    if (alts.length > 0) {
      const currentScore = known
        ? scoreLayoutAlternative(layoutById.get(slide.layoutId)!, hints)
        : Number.NEGATIVE_INFINITY;
      const bestScore = scoreLayoutAlternative(alts[0], hints);
      if (!known || bestScore - currentScore >= 2) reasons.push('better_alternative');
    }
    const needsRemap =
      reasons.includes('unknown_layout') ||
      reasons.includes('better_alternative') ||
      (reasons.includes('theme_mode_shift') && alts.length > 0 && !known);
    return {
      slideId: slide.id,
      role: slide.role,
      layoutId: slide.layoutId,
      needsRemap,
      reasons,
      alternatives: alts.map((layout) => layout.id),
    };
  });

  const report: ThemeRemapReport = {
    fromThemeId: spec.theme.id,
    toThemeId: toId,
    modeChange,
    generatedAt: new Date().toISOString(),
    needsRemapCount: slides.filter((slide) => slide.needsRemap).length,
    slides,
  };

  const writeReport = options?.writeReport !== false;
  const pinCandidates = options?.pinCandidates !== false;
  const next = mutateDeck(spec, (draft) => {
    draft.theme.id = toId;
    draft.theme.mode = toMode;
    if (writeReport) {
      draft.extensions = { ...draft.extensions, themeRemap: report };
    }
    if (pinCandidates) {
      for (const row of slides) {
        if (!row.needsRemap || row.alternatives.length === 0) continue;
        const slide = draft.slides.find((item) => item.id === row.slideId);
        if (!slide) continue;
        const existing = slide.candidates ?? [];
        const merged = [...existing];
        for (const id of row.alternatives.slice(0, 3)) {
          if (!merged.includes(id)) merged.push(id);
        }
        slide.candidates = merged.length ? merged : undefined;
      }
    }
  });

  return { spec: next, report };
};
