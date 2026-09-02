import type { ChatFileRef } from '@/common/types/chatFile';
import type { DeckBlock, DeckLayout, DeckSlide, DeckSlot, DeckSpecV1 } from '@/common/types/office/presentation';

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

const MODULE_SLOT_IDS: Record<string, string[]> = {
  metrics: ['metric1', 'metric2', 'metric3'],
  'kpi-trio': ['metric1', 'metric2', 'metric3'],
  'metrics-row-4': ['metric1', 'metric2', 'metric3', 'metric4'],
  cards: ['card1', 'card2', 'card3'],
  'agenda-cards': ['card1', 'card2', 'card3'],
  'three-column': ['col1', 'col2', 'col3'],
  'comparison-three': ['col1', 'col2', 'col3'],
  'process-steps': ['step1', 'step2', 'step3', 'step4'],
  'process-horizontal': ['step1', 'step2', 'step3', 'step4'],
  'cycle-4': ['step1', 'step2', 'step3', 'step4'],
  team: ['member1', 'member2', 'member3', 'member4'],
  funnel: ['stage1', 'stage2', 'stage3', 'stage4'],
  'gallery-two': ['visual1', 'visual2'],
};

const packModuleSlots = (layoutId: string, slot: DeckSlot, controls: Record<string, unknown>): DeckSlot => {
  const moduleIds = MODULE_SLOT_IDS[layoutId];
  if (!moduleIds) return slot;
  const index = moduleIds.indexOf(slot.id);
  if (index < 0) return slot;
  const count = Math.min(
    moduleIds.length,
    Math.max(1, Math.round(controlNumber(controls, 'moduleCount', moduleIds.length)))
  );
  if (index >= count) return { ...slot, width: 0, height: 0 };
  // Keep authored geometry for non-row packs (funnel stages, 2x2 cycle, gallery).
  if (layoutId === 'funnel' || layoutId === 'cycle-4' || layoutId === 'gallery-two') return slot;
  const start = 0.06;
  const total = 0.88;
  const gap = 0.03;
  const usable = total - gap * Math.max(0, count - 1);
  const width = usable / count;
  return { ...slot, x: start + index * (width + gap), width };
};

/** Mirror OfficeCLI DeckService.AdjustSlot / PackModuleSlots for Studio preview parity. */
export const resolveLayoutSlots = (layout: DeckLayout, slide: DeckSlide): DeckSlot[] => {
  const controls = slide.controls ?? {};
  return layout.slots
    .filter((slot) => {
      if (
        (layout.id === 'chart' || layout.id === 'chart-radar') &&
        slot.id === 'insight' &&
        !controlBool(controls, 'showInsight', true)
      ) {
        return false;
      }
      if (layout.id === 'data-table' && slot.id === 'insight' && !controlBool(controls, 'showInsight', true)) {
        return false;
      }
      return true;
    })
    .map((slot) => {
      if (
        (layout.id === 'image-text' ||
          layout.id === 'two-column' ||
          layout.id === 'cover-split' ||
          layout.id === 'quote-split') &&
        controlString(controls, 'mediaSide', 'left') === 'right'
      ) {
        return { ...slot, x: 1 - slot.x - slot.width };
      }

      if (
        (layout.id === 'chart' || layout.id === 'chart-radar') &&
        slot.id === 'chart' &&
        !controlBool(controls, 'showInsight', true)
      ) {
        return { ...slot, width: 0.88 };
      }

      if (layout.id === 'data-table' && slot.id === 'table' && !controlBool(controls, 'showInsight', true)) {
        return { ...slot, x: 0.06, width: 0.88 };
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
          layout.id === 'chart-compare') &&
        (slot.id === 'left' || slot.id === 'right' || slot.id === 'kpi' || slot.id === 'support')
      ) {
        const balance = Math.min(65, Math.max(35, controlNumber(controls, 'balance', 50))) / 100;
        const start = 0.06;
        const gap = 0.06;
        const usable = 0.88 - gap;
        const leftWidth = usable * balance;
        return slot.id === 'left' || slot.id === 'kpi'
          ? { ...slot, x: start, width: leftWidth }
          : { ...slot, x: start + leftWidth + gap, width: usable - leftWidth };
      }

      if (
        (layout.id === 'comparison-table' ||
          layout.id === 'risk' ||
          layout.id === 'risk-heatmap' ||
          layout.id === 'data-table') &&
        (slot.id === 'left' ||
          slot.id === 'summary' ||
          slot.id === 'insight' ||
          slot.id === 'table' ||
          slot.id === 'matrix')
      ) {
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
        layout.id === 'swot' &&
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

/** Same-role layout alternatives for one-click switching in PresentationStudio (CSBU WorkMate). */
export const suggestLayoutAlternatives = (
  layouts: DeckLayout[],
  currentLayoutId: string,
  role: string,
  limit = 4
): DeckLayout[] => {
  const sameRole = layouts.filter((layout) => layout.role === role);
  const preferred = sameRole.filter((layout) => layout.id !== currentLayoutId);
  const ordered = [...sameRole.filter((layout) => layout.id === currentLayoutId), ...preferred];
  return ordered.slice(0, Math.max(1, limit));
};

/** Migrates a slide to a semantic layout without retaining invalid slot or control state. */
export const changeSlideLayout = (spec: DeckSpecV1, slideId: string, layout: DeckLayout): DeckSpecV1 => {
  const source = spec.slides.find((slide) => slide.id === slideId);
  if (!source || source.layoutId === layout.id) return spec;
  return updateSlide(spec, slideId, (slide) => {
    slide.layoutId = layout.id;
    slide.role = layout.role;
    slide.controls = Object.fromEntries(layout.controls.map((control) => [control.id, control.defaultValue]));

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

const uniqueId = (base: string, ids: string[]): string => {
  if (!ids.includes(base)) return base;
  let suffix = 2;
  while (ids.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};
