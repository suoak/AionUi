import type { DeckBlock, DeckLayout, DeckSlide } from '@/common/types/office/presentation';
import { Button, Input, Select, Slider, Switch, Upload } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { suggestLayoutAlternatives } from './deckState';

type Props = {
  slide: DeckSlide;
  block?: DeckBlock;
  layouts: DeckLayout[];
  onLayoutChange: (layout: DeckLayout) => void;
  onSlideChange: (update: (slide: DeckSlide) => void) => void;
  onBlockChange: (update: (block: DeckBlock) => void) => void;
  onImportImage: (block: DeckBlock) => void;
  onUploadImage: (block: DeckBlock, file: File) => void;
  onGenerateImage: (block: DeckBlock) => void;
  importingAssetId?: string;
};

const Inspector: React.FC<Props> = ({
  slide,
  block,
  layouts,
  onLayoutChange,
  onSlideChange,
  onBlockChange,
  onImportImage,
  onUploadImage,
  onGenerateImage,
  importingAssetId,
}) => {
  const { t } = useTranslation();
  const textValue = block?.items?.join('\n') ?? block?.text ?? block?.value ?? '';
  const currentLayout = layouts.find((layout) => layout.id === slide.layoutId);
  const layoutControls = currentLayout?.controls ?? [];
  const roleAlternatives = useMemo(
    () => suggestLayoutAlternatives(layouts, slide.layoutId, slide.role, 4),
    [layouts, slide.layoutId, slide.role]
  );
  const setControl = (id: string, value: unknown) =>
    onSlideChange((draft) => {
      draft.controls = { ...draft.controls, [id]: value };
    });

  return (
    <div
      className='w-280px flex-shrink-0 overflow-y-auto border-l border-border-2 bg-bg-2 p-14px'
      data-testid='presentation-inspector'
    >
      <label className='block text-12px text-t-secondary mb-5px'>{t('presentation.field.slideTitle')}</label>
      <Input
        value={slide.title ?? ''}
        onChange={(value) =>
          onSlideChange((draft) => {
            draft.title = value;
          })
        }
      />

      <label className='block text-12px text-t-secondary mt-14px mb-5px'>
        {t('presentation.field.layoutAlternatives')}
      </label>
      <div className='flex flex-wrap gap-6px' data-testid='presentation-layout-alternatives'>
        {roleAlternatives.map((layout) => (
          <Button
            key={layout.id}
            size='mini'
            type={layout.id === slide.layoutId ? 'primary' : 'outline'}
            onClick={() => onLayoutChange(layout)}
          >
            {t(`presentation.catalog.layout.${layout.id}`, { defaultValue: layout.label })}
          </Button>
        ))}
      </div>

      <label className='block text-12px text-t-secondary mt-14px mb-5px'>{t('presentation.field.layout')}</label>
      <Select
        value={slide.layoutId}
        className='w-full'
        onChange={(value) => {
          const nextLayout = layouts.find((layout) => layout.id === value);
          if (nextLayout) onLayoutChange(nextLayout);
        }}
      >
        {layouts.map((layout) => (
          <Select.Option key={layout.id} value={layout.id}>
            {t(`presentation.catalog.layout.${layout.id}`, { defaultValue: layout.label })}
          </Select.Option>
        ))}
      </Select>

      {layoutControls.length > 0 && (
        <div className='mt-14px' data-testid='presentation-layout-controls'>
          <div className='text-13px font-500 mb-8px'>{t('presentation.field.layoutControls')}</div>
          {layoutControls.map((control) => {
            const value = slide.controls?.[control.id] ?? control.defaultValue;
            return (
              <div key={control.id} className='mt-12px' data-testid={`layout-control-${control.id}`}>
                <div className='text-12px text-t-secondary mb-5px'>
                  {t(`presentation.catalog.control.${control.id}`, { defaultValue: control.label })}
                </div>
                {control.type === 'toggle' ? (
                  <Switch
                    size='small'
                    checked={Boolean(value)}
                    onChange={(checked) => setControl(control.id, checked)}
                  />
                ) : control.type === 'select' ? (
                  <Select
                    className='w-full'
                    value={String(value)}
                    onChange={(selected) => setControl(control.id, selected)}
                  >
                    {(control.options ?? []).map((option) => (
                      <Select.Option key={option} value={option}>
                        {t(`presentation.catalog.option.${option}`, { defaultValue: option })}
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <Slider
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={Number(value)}
                    onChange={(selected) => setControl(control.id, Array.isArray(selected) ? selected[0] : selected)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className='flex items-center justify-between mt-14px'>
        <span className='text-12px text-t-secondary'>{t('presentation.field.hidden')}</span>
        <Switch
          size='small'
          checked={Boolean(slide.hidden)}
          onChange={(checked) =>
            onSlideChange((draft) => {
              draft.hidden = checked;
            })
          }
        />
      </div>

      <label className='block text-12px text-t-secondary mt-14px mb-5px'>{t('presentation.field.notes')}</label>
      <Input.TextArea
        autoSize={{ minRows: 3, maxRows: 8 }}
        value={slide.notes ?? ''}
        onChange={(value) =>
          onSlideChange((draft) => {
            draft.notes = value;
          })
        }
      />

      {block && (
        <>
          <div className='mt-18px pt-14px border-t border-border-2 text-13px font-500'>
            {t('presentation.field.content')}
          </div>
          <div className='text-11px text-t-tertiary mt-4px'>
            {block.type} · {block.slot}
          </div>
          <Input.TextArea
            className='mt-8px'
            autoSize={{ minRows: 4, maxRows: 12 }}
            value={textValue}
            onChange={(value) =>
              onBlockChange((draft) => {
                if (draft.type === 'list' || draft.type === 'timeline') draft.items = value.split('\n');
                else if (draft.type === 'metric') draft.value = value;
                else draft.text = value;
              })
            }
          />
          {block.type === 'image' && (
            <div className='mt-8px grid grid-cols-3 gap-8px'>
              <Upload
                accept='image/png,image/jpeg,image/gif'
                showUploadList={false}
                autoUpload={false}
                beforeUpload={(file) => {
                  onUploadImage(block, file);
                  return false;
                }}
              >
                <Button long loading={importingAssetId === block.id}>
                  {t('presentation.action.uploadImage')}
                </Button>
              </Upload>
              <Button loading={importingAssetId === block.id} onClick={() => onImportImage(block)}>
                {t('presentation.action.selectImage')}
              </Button>
              <Button type='primary' onClick={() => onGenerateImage(block)}>
                {t('presentation.action.generateImage')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Inspector;
