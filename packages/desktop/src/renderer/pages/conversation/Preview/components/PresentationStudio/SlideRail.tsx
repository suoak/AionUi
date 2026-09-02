import type { DeckAsset, DeckSlide } from '@/common/types/office/presentation';
import { Button, Tooltip } from '@arco-design/web-react';
import { Copy, Delete, Drag } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { slideHasUnresolvedMedia } from './deckState';

type Props = {
  slides: DeckSlide[];
  assets: DeckAsset[];
  selectedId: string;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

const SlideRail: React.FC<Props> = ({ slides, assets, selectedId, onSelect, onMove, onDuplicate, onDelete }) => {
  const { t } = useTranslation();
  return (
    <div className='w-190px flex-shrink-0 overflow-y-auto border-r border-border-2 p-10px bg-bg-2'>
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          draggable
          onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const from = Number(event.dataTransfer.getData('text/plain'));
            if (Number.isInteger(from)) onMove(from, index);
          }}
          className={`mb-10px rd-6px border border-solid p-8px ${
            slide.id === selectedId ? 'border-primary bg-bg-1' : 'border-border-2 bg-bg-1'
          }`}
        >
          <Button type='text' long className='h-auto text-left' onClick={() => onSelect(slide.id)}>
            <span className='block w-full'>
              <span className='flex items-center gap-6px text-12px text-t-secondary'>
                <Drag size={14} />
                <span>{index + 1}</span>
                {slide.hidden && <span>{t('presentation.slide.hidden')}</span>}
                {slideHasUnresolvedMedia(slide, assets) && (
                  <span className='text-warning-6' data-testid={`slide-pending-media-${slide.id}`}>
                    {t('presentation.slide.pendingMedia')}
                  </span>
                )}
              </span>
              <span className='block mt-6px text-13px line-clamp-2 text-t-primary'>{slide.title || slide.role}</span>
            </span>
          </Button>
          <div className='mt-6px flex justify-end gap-4px'>
            <Tooltip content={t('presentation.action.duplicate')}>
              <Button
                size='mini'
                type='text'
                icon={<Copy />}
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicate(slide.id);
                }}
              />
            </Tooltip>
            <Tooltip content={t('presentation.action.delete')}>
              <Button
                size='mini'
                type='text'
                status='danger'
                disabled={slides.length <= 1}
                icon={<Delete />}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(slide.id);
                }}
              />
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SlideRail;
