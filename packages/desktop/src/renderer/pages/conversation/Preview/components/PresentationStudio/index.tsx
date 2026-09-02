import { ipcBridge } from '@/common';
import { localFileRef, uploadFileRef, type ChatFileRef } from '@/common/types/chatFile';
import type {
  DeckBlock,
  DeckSpecV1,
  PresentationCatalog,
  PresentationDiagnostic,
  PresentationFileRequest,
  PresentationRenderJob,
} from '@/common/types/office/presentation';
import { Alert, Button, Empty, Message, Select, Spin } from '@arco-design/web-react';
import { Check, Export, Refresh, Undo } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadTextContent } from '@/renderer/utils/file/download';
import { uploadFileViaHttp } from '@/renderer/services/FileService';
import { usePreviewContext } from '../../context/PreviewContext';
import { classifySaveOutcome } from '../PreviewPanel/previewToolbarUtils';
import DeckCanvas from './DeckCanvas';
import Inspector from './Inspector';
import SlideRail from './SlideRail';
import {
  MAX_DECK_HISTORY,
  canFinalizeSave,
  changeSlideLayout,
  confirmOutline,
  duplicateSlide,
  evaluateOutlineGate,
  isCurrentRevision,
  moveSlide,
  mutateDeck,
  parseDeckSpec,
  removeSlide,
  serializeDeckSpec,
  setAssetReady,
  updateBlock,
  updateSlide,
} from './deckState';
import ThemeOptionLabel from './ThemeOptionLabel';

type Props = {
  content: string;
  fileRef?: ChatFileRef;
  filePath?: string;
  fileName?: string;
  workspace?: string;
  onChange: (content: string) => void;
  onSave: () => Promise<boolean>;
  onReload: () => Promise<boolean>;
};

const POLL_INTERVAL_MS = 500;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const PresentationStudio: React.FC<Props> = ({
  content,
  fileRef,
  filePath,
  fileName,
  workspace,
  onChange,
  onSave,
  onReload,
}) => {
  const { t } = useTranslation();
  const { addToSendBox } = usePreviewContext();
  const [spec, setSpec] = useState<DeckSpecV1 | null>(() => parseDeckSpec(content));
  const [catalog, setCatalog] = useState<PresentationCatalog | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string>(() => parseDeckSpec(content)?.slides[0]?.id ?? '');
  const [selectedBlockId, setSelectedBlockId] = useState<string>();
  const [past, setPast] = useState<DeckSpecV1[]>([]);
  const [future, setFuture] = useState<DeckSpecV1[]>([]);
  const [diagnostics, setDiagnostics] = useState<PresentationDiagnostic[]>([]);
  const [job, setJob] = useState<PresentationRenderJob>();
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const [importingAssetId, setImportingAssetId] = useState<string>();
  const dirtyRevision = useRef<number | undefined>(undefined);
  const currentRevision = useRef(spec?.revision);
  const specRef = useRef(spec);
  const activeJob = useRef<PresentationRenderJob | undefined>(undefined);
  const reloadRequested = useRef(false);
  specRef.current = spec;

  const cancelActiveRender = useCallback(() => {
    if (activeJob.current && ['queued', 'running'].includes(activeJob.current.status)) {
      void ipcBridge.presentation.cancel.invoke({ job_id: activeJob.current.job_id }).catch((): void => undefined);
    }
    activeJob.current = undefined;
    setJob(undefined);
  }, []);

  useEffect(() => {
    let active = true;
    ipcBridge.presentation.catalog
      .invoke()
      .then((value) => active && setCatalog(value))
      .catch(() => active && setCatalogError(true))
      .finally(() => active && setLoadingCatalog(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (activeJob.current && ['queued', 'running'].includes(activeJob.current.status)) {
        void ipcBridge.presentation.cancel.invoke({ job_id: activeJob.current.job_id }).catch((): void => undefined);
      }
    },
    []
  );

  useEffect(() => {
    const next = parseDeckSpec(content);
    if (!next || (!reloadRequested.current && next.revision === currentRevision.current)) return;
    reloadRequested.current = false;
    currentRevision.current = next.revision;
    dirtyRevision.current = undefined;
    setSpec(next);
    setPast([]);
    setFuture([]);
    setSelectedSlideId(next.slides[0]?.id ?? '');
  }, [content]);

  const source = useMemo<PresentationFileRequest>(
    () => ({
      file: fileRef,
      file_path: filePath,
      workspace,
    }),
    [filePath, fileRef, workspace]
  );

  const commit = useCallback(
    (next: DeckSpecV1, previous: DeckSpecV1) => {
      if (next.revision === previous.revision) return;
      cancelActiveRender();
      currentRevision.current = next.revision;
      dirtyRevision.current = next.revision;
      setPast((items) => [...items.slice(-(MAX_DECK_HISTORY - 1)), previous]);
      setFuture([]);
      setSpec(next);
      onChange(serializeDeckSpec(next));
    },
    [cancelActiveRender, onChange]
  );

  const renderRevision = useCallback(
    async (revision: number) => {
      const started = await ipcBridge.presentation.render.invoke({ ...source, expected_revision: revision });
      if (!isCurrentRevision(currentRevision.current, revision)) {
        void ipcBridge.presentation.cancel.invoke({ job_id: started.job_id }).catch((): void => undefined);
        return;
      }
      activeJob.current = started;
      setJob(started);
      try {
        let latest = started;
        while (latest.status === 'queued' || latest.status === 'running') {
          await new Promise<void>((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
          latest = await ipcBridge.presentation.job.invoke({ job_id: latest.job_id });
          if (!isCurrentRevision(currentRevision.current, revision)) return;
          activeJob.current = latest;
          setJob(latest);
        }
      } finally {
        if (activeJob.current?.job_id === started.job_id) activeJob.current = undefined;
      }
    },
    [source]
  );

  useEffect(() => {
    if (!spec || saveConflict || dirtyRevision.current !== spec.revision) return;
    const revision = spec.revision;
    const timer = window.setTimeout(() => {
      void onSave()
        .then(async (saved) => {
          if (!saved) {
            Message.error(t('presentation.status.saveFailed'));
            return;
          }
          if (!isCurrentRevision(currentRevision.current, revision)) return;
          dirtyRevision.current = undefined;
          if (spec.stage !== 'ready') return;
          try {
            await renderRevision(revision);
          } catch {
            Message.error(t('presentation.status.renderFailed'));
          }
        })
        .catch((error: unknown) => {
          if (classifySaveOutcome(undefined, error).kind === 'conflict') setSaveConflict(true);
          else Message.error(t('presentation.status.saveFailed'));
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [onSave, renderRevision, saveConflict, spec, t]);

  const validate = useCallback(async () => {
    if (saveConflict) return;
    const revision = currentRevision.current;
    try {
      const revisionBeingSaved = dirtyRevision.current;
      if (revisionBeingSaved !== undefined) {
        const saved = await onSave();
        if (!saved) return;
        if (!canFinalizeSave(currentRevision.current, revision, dirtyRevision.current, revisionBeingSaved)) return;
        dirtyRevision.current = undefined;
      }
      const result = await ipcBridge.presentation.validate.invoke(source);
      if (!isCurrentRevision(currentRevision.current, revision)) return;
      setDiagnostics(result.diagnostics);
      if (result.valid) Message.success(t('presentation.status.valid'));
      else Message.warning(t('presentation.status.invalid'));
    } catch (error: unknown) {
      if (classifySaveOutcome(undefined, error).kind === 'conflict') setSaveConflict(true);
      else Message.error(t('presentation.status.validateFailed'));
    }
  }, [onSave, saveConflict, source, t]);

  const exportPptx = useCallback(async () => {
    if (!spec || spec.stage !== 'ready' || saveConflict) return;
    const revision = spec.revision;
    try {
      const revisionBeingSaved = dirtyRevision.current;
      const saved = revisionBeingSaved === undefined || (await onSave());
      if (!saved) return;
      if (!canFinalizeSave(currentRevision.current, revision, dirtyRevision.current, revisionBeingSaved)) return;
      dirtyRevision.current = undefined;
      await renderRevision(revision);
    } catch (error: unknown) {
      if (classifySaveOutcome(undefined, error).kind === 'conflict') setSaveConflict(true);
      else Message.error(t('presentation.status.renderFailed'));
    }
  }, [onSave, renderRevision, saveConflict, spec, t]);

  const runImageImport = useCallback(
    async (imageBlock: DeckBlock, resolveSource: () => Promise<ChatFileRef | null>) => {
      if (!imageBlock.assetId) {
        Message.error(t('presentation.media.assetIdRequired'));
        return;
      }
      try {
        setImportingAssetId(imageBlock.id);
        const sourceFile = await resolveSource();
        if (!sourceFile) return;
        const imported = await ipcBridge.presentation.importAsset.invoke({
          deck: source,
          source_file: sourceFile,
          asset_id: imageBlock.assetId,
        });
        const latest = specRef.current;
        const stillReferenced = latest?.slides.some((item) =>
          item.blocks.some((candidate) => candidate.id === imageBlock.id && candidate.assetId === imageBlock.assetId)
        );
        if (!latest || !stillReferenced) {
          Message.warning(t('presentation.media.importOutdated'));
          return;
        }
        commit(setAssetReady(latest, imageBlock.assetId, imported.asset_path), latest);
        Message.success(t('presentation.media.importSuccess'));
      } catch {
        Message.error(t('presentation.media.importFailed'));
      } finally {
        setImportingAssetId((current) => (current === imageBlock.id ? undefined : current));
      }
    },
    [commit, source, t]
  );

  const importImage = useCallback(
    (imageBlock: DeckBlock) =>
      runImageImport(imageBlock, async () => {
        const files = await ipcBridge.dialog.showOpen.invoke({
          properties: ['openFile'],
          filters: [{ name: t('presentation.media.imageFiles'), extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
        });
        return files?.[0] ? localFileRef(files[0]) : null;
      }),
    [runImageImport, t]
  );

  const uploadImage = useCallback(
    (imageBlock: DeckBlock, file: File) => {
      if (file.size > MAX_IMAGE_BYTES) {
        Message.error(t('presentation.media.fileTooLarge'));
        return Promise.resolve();
      }
      return runImageImport(imageBlock, async () => uploadFileRef(await uploadFileViaHttp(file)));
    },
    [runImageImport, t]
  );

  if (!spec) {
    return (
      <div className='h-full flex items-center justify-center p-24px'>
        <Alert type='error' content={t('presentation.error.invalidSpec')} />
      </div>
    );
  }
  if (loadingCatalog)
    return (
      <div className='h-full flex items-center justify-center'>
        <Spin />
      </div>
    );
  if (catalogError || !catalog) {
    return (
      <div className='h-full flex items-center justify-center p-24px'>
        <Alert type='error' content={t('presentation.error.catalogUnavailable')} />
      </div>
    );
  }

  const slide = spec.slides.find((item) => item.id === selectedSlideId) ?? spec.slides[0];
  if (!slide)
    return (
      <div className='h-full flex items-center justify-center'>
        <Empty description={t('presentation.error.noSlides')} />
      </div>
    );
  const layout = catalog.layouts.find((item) => item.id === slide.layoutId);
  const theme = catalog.themes.find((item) => item.id === spec.theme.id);
  const block = slide.blocks.find((item) => item.id === selectedBlockId);

  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    const next = { ...structuredClone(previous), revision: spec.revision + 1 };
    cancelActiveRender();
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [spec, ...items].slice(0, MAX_DECK_HISTORY));
    currentRevision.current = next.revision;
    dirtyRevision.current = next.revision;
    setSpec(next);
    onChange(serializeDeckSpec(next));
  };
  const redo = () => {
    const upcoming = future[0];
    if (!upcoming) return;
    const next = { ...structuredClone(upcoming), revision: spec.revision + 1 };
    cancelActiveRender();
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-(MAX_DECK_HISTORY - 1)), spec]);
    currentRevision.current = next.revision;
    dirtyRevision.current = next.revision;
    setSpec(next);
    onChange(serializeDeckSpec(next));
  };

  return (
    <div className='h-full min-h-0 flex flex-col bg-bg-1'>
      <div className='h-48px flex-shrink-0 flex items-center gap-8px border-b border-border-2 px-12px bg-bg-2'>
        <Button size='small' type='text' icon={<Undo />} disabled={!past.length} onClick={undo}>
          {t('presentation.action.undo')}
        </Button>
        <Button size='small' type='text' disabled={!future.length} onClick={redo}>
          {t('presentation.action.redo')}
        </Button>
        <Select
          size='small'
          className='w-220px'
          value={spec.theme.id}
          renderFormat={(option) => {
            const item = catalog.themes.find((theme) => theme.id === (option?.value ?? spec.theme.id));
            if (!item) return spec.theme.id;
            return (
              <ThemeOptionLabel
                theme={item}
                label={t(`presentation.catalog.theme.${item.id}`, { defaultValue: item.label })}
              />
            );
          }}
          onChange={(value) =>
            commit(
              mutateDeck(spec, (draft) => {
                draft.theme.id = value;
              }),
              spec
            )
          }
        >
          {catalog.themes.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              <ThemeOptionLabel
                theme={item}
                label={t(`presentation.catalog.theme.${item.id}`, { defaultValue: item.label })}
              />
            </Select.Option>
          ))}
        </Select>
        <div className='flex-1' />
        {job && <span className='text-12px text-t-secondary'>{t(`presentation.job.${job.status}`)}</span>}
        <Button
          size='small'
          type='text'
          icon={<Refresh />}
          onClick={() => addToSendBox(t('presentation.slide.regeneratePrompt', { slideId: slide.id }))}
        >
          {t('presentation.action.regenerate')}
        </Button>
        <Button size='small' icon={<Check />} onClick={() => void validate()}>
          {t('presentation.action.validate')}
        </Button>
        <Button
          size='small'
          type='primary'
          icon={<Export />}
          loading={job?.status === 'queued' || job?.status === 'running'}
          disabled={spec.stage !== 'ready'}
          title={spec.stage !== 'ready' ? t('presentation.outline.exportBlocked') : undefined}
          onClick={() => void exportPptx()}
        >
          {t('presentation.action.export')}
        </Button>
      </div>
      {spec.stage === 'outline' && (
        <div
          className='border-b border-border-2 bg-primary-light px-12px py-10px'
          data-testid='presentation-outline-gate'
        >
          <div className='text-13px font-500 mb-6px'>{t('presentation.outline.title')}</div>
          <div className='text-12px text-t-secondary mb-8px'>{t('presentation.outline.description')}</div>
          <div className='grid grid-cols-2 gap-x-16px gap-y-4px text-12px mb-8px'>
            <div>
              <span className='text-t-tertiary'>{t('presentation.outline.metaTitle')}: </span>
              {spec.metadata.title.trim() || t('presentation.outline.empty')}
            </div>
            <div>
              <span className='text-t-tertiary'>{t('presentation.outline.metaLanguage')}: </span>
              {spec.metadata.language.trim() || t('presentation.outline.empty')}
            </div>
            <div>
              <span className='text-t-tertiary'>{t('presentation.outline.metaGoal')}: </span>
              {spec.metadata.goal?.trim() || t('presentation.outline.empty')}
            </div>
            <div>
              <span className='text-t-tertiary'>{t('presentation.outline.metaAudience')}: </span>
              {spec.metadata.audience?.trim() || t('presentation.outline.empty')}
            </div>
            <div className='col-span-2'>
              <span className='text-t-tertiary'>{t('presentation.outline.metaTheme')}: </span>
              {theme
                ? t(`presentation.catalog.theme.${theme.id}`, { defaultValue: theme.label })
                : spec.theme.id || t('presentation.outline.empty')}
            </div>
            <div className='col-span-2'>
              <span className='text-t-tertiary'>{t('presentation.outline.metaSlides')}: </span>
              {spec.slides.map((item) => item.title?.trim() || item.id).join(' · ') || t('presentation.outline.empty')}
            </div>
          </div>
          {(() => {
            const gate = evaluateOutlineGate(spec);
            return (
              <div className='flex flex-wrap items-center gap-8px'>
                {!gate.canConfirm && (
                  <span className='text-12px text-t-warning'>{t('presentation.outline.missingRequired')}</span>
                )}
                {gate.canConfirm && gate.warnings.length > 0 && (
                  <span className='text-12px text-t-warning'>{t('presentation.outline.warnGoalAudience')}</span>
                )}
                <div className='flex-1' />
                <Button
                  size='small'
                  type='text'
                  icon={<Refresh />}
                  onClick={() => addToSendBox(t('presentation.outline.continuePrompt'))}
                >
                  {t('presentation.outline.continue')}
                </Button>
                <Button
                  size='small'
                  type='primary'
                  icon={<Check />}
                  disabled={!gate.canConfirm}
                  data-testid='presentation-outline-confirm'
                  onClick={() => {
                    const next = confirmOutline(spec);
                    if (next === spec) {
                      Message.warning(t('presentation.outline.missingRequired'));
                      return;
                    }
                    if (gate.warnings.length > 0) Message.warning(t('presentation.outline.warnGoalAudience'));
                    commit(next, spec);
                    Message.success(t('presentation.outline.confirmed'));
                    addToSendBox(t('presentation.outline.continuePrompt'));
                  }}
                >
                  {t('presentation.outline.confirm')}
                </Button>
              </div>
            );
          })()}
        </div>
      )}
      {saveConflict && (
        <Alert
          type='warning'
          content={t('presentation.conflict.description')}
          action={
            <div className='flex gap-8px'>
              <Button
                size='small'
                onClick={() =>
                  downloadTextContent(
                    content,
                    fileName ?? 'presentation.workmate-deck.json',
                    'application/json;charset=utf-8'
                  )
                }
              >
                {t('presentation.conflict.saveAs')}
              </Button>
              <Button
                size='small'
                type='primary'
                onClick={() => {
                  reloadRequested.current = true;
                  void onReload().then((reloaded) => {
                    if (reloaded) setSaveConflict(false);
                    else reloadRequested.current = false;
                  });
                }}
              >
                {t('presentation.conflict.reload')}
              </Button>
            </div>
          }
        />
      )}
      {diagnostics.length > 0 && (
        <div className='max-h-80px overflow-auto border-b border-border-2 px-12px py-6px text-12px text-t-warning'>
          {diagnostics.map((item, index) => (
            <Button
              key={`${item.code}-${index}`}
              type='text'
              size='mini'
              className='block'
              onClick={() => {
                if (item.slide_id) setSelectedSlideId(item.slide_id);
                setSelectedBlockId(item.block_id);
              }}
            >
              {item.slide_id ? `${item.slide_id}: ` : ''}
              {item.message}
            </Button>
          ))}
        </div>
      )}
      <div className='flex-1 min-h-0 flex'>
        <SlideRail
          slides={spec.slides}
          selectedId={slide.id}
          onSelect={(id) => {
            setSelectedSlideId(id);
            setSelectedBlockId(undefined);
          }}
          onMove={(from, to) => commit(moveSlide(spec, from, to), spec)}
          onDuplicate={(id) => commit(duplicateSlide(spec, id), spec)}
          onDelete={(id) => {
            const next = removeSlide(spec, id);
            commit(next, spec);
            if (id === slide.id) setSelectedSlideId(next.slides[0]?.id ?? '');
          }}
        />
        <div className='flex-1 min-w-0 overflow-auto p-24px flex items-center justify-center bg-bg-3'>
          <DeckCanvas
            slide={slide}
            layout={layout}
            theme={theme}
            assets={spec.assets}
            deckRef={fileRef}
            deckPath={filePath}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onEditBlockText={(blockId, value) =>
              commit(
                updateBlock(spec, slide.id, blockId, (draft) => {
                  if (draft.type === 'list' || draft.type === 'timeline') draft.items = value.split('\n');
                  else if (draft.type === 'metric') draft.value = value;
                  else draft.text = value;
                }),
                spec
              )
            }
          />
        </div>
        <Inspector
          slide={slide}
          block={block}
          layouts={catalog.layouts}
          onLayoutChange={(nextLayout) => commit(changeSlideLayout(spec, slide.id, nextLayout), spec)}
          onSlideChange={(update) => commit(updateSlide(spec, slide.id, update), spec)}
          onBlockChange={(update) => block && commit(updateBlock(spec, slide.id, block.id, update), spec)}
          onImportImage={(imageBlock) => void importImage(imageBlock)}
          onUploadImage={(imageBlock, file) => void uploadImage(imageBlock, file)}
          onGenerateImage={(imageBlock) =>
            addToSendBox(
              t('presentation.media.generatePrompt', {
                slideId: slide.id,
                blockId: imageBlock.id,
                assetId: imageBlock.assetId ?? '',
              })
            )
          }
          importingAssetId={importingAssetId}
        />
      </div>
    </div>
  );
};

export default PresentationStudio;
