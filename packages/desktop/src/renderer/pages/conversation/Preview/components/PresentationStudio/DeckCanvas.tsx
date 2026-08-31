import type { ChatFileRef } from '@/common/types/chatFile';
import type { DeckAsset, DeckBlock, DeckLayout, DeckSlide, DeckTheme } from '@/common/types/office/presentation';
import { Button, Input } from '@arco-design/web-react';
import React from 'react';
import { resolveLayoutSlots } from './deckState';
import MediaBlock from './MediaBlock';

type Props = {
  slide: DeckSlide;
  layout?: DeckLayout;
  theme?: DeckTheme;
  assets: DeckAsset[];
  deckRef?: ChatFileRef;
  deckPath?: string;
  selectedBlockId?: string;
  onSelectBlock: (blockId: string) => void;
  onEditBlockText: (blockId: string, value: string) => void;
};

const blockLabel = (block: DeckBlock): string => {
  if (block.type === 'list' || block.type === 'timeline') return block.items?.join('\n') ?? block.text ?? '';
  if (block.type === 'metric') return [block.value, block.label].filter(Boolean).join('\n');
  if (block.type === 'image') return block.assetId ? `▧ ${block.assetId}` : '▧';
  if (block.type === 'chart') return '▥';
  if (block.type === 'table') return '▦';
  return block.text ?? block.value ?? '';
};

const color = (theme: DeckTheme | undefined, key: string, fallback: string): string =>
  `#${theme?.tokens[key] ?? fallback}`;

const DeckCanvas: React.FC<Props> = ({
  slide,
  layout,
  theme,
  assets,
  deckRef,
  deckPath,
  selectedBlockId,
  onSelectBlock,
  onEditBlockText,
}) => (
  <div
    className='w-full max-w-1000px aspect-video relative overflow-hidden shadow-lg rd-8px'
    style={{
      background: color(theme, 'background', 'FFFFFF'),
      color: color(theme, 'text', '172033'),
      fontFamily: theme?.tokens.fontFamily,
    }}
  >
    {layout && resolveLayoutSlots(layout, slide).map((slot) => {
      const block = slide.blocks.find((item) => item.slot === slot.id);
      return (
        <div
          key={slot.id}
          className={`absolute overflow-hidden rd-6px border border-solid whitespace-pre-line ${
            block?.id === selectedBlockId ? 'border-primary' : 'border-transparent'
          }`}
          style={{
            left: `${slot.x * 100}%`,
            top: `${slot.y * 100}%`,
            width: `${slot.width * 100}%`,
            height: `${slot.height * 100}%`,
            background:
              block && ['metric', 'shape'].includes(block.type) ? color(theme, 'surface', 'FFFFFF') : undefined,
            color: block?.type === 'metric' ? color(theme, 'accent', '246BFD') : undefined,
          }}
        >
          {block?.id === selectedBlockId && !['image', 'chart', 'table', 'shape'].includes(block.type) ? (
            <Input.TextArea
              autoFocus
              className='w-full h-full p-10px'
              value={blockLabel(block)}
              onChange={(value) => onEditBlockText(block.id, value)}
            />
          ) : block ? (
            <Button
              type='text'
              long
              className='w-full h-full p-10px text-left whitespace-pre-line'
              onClick={() => onSelectBlock(block.id)}
            >
              {block.type === 'image' ? (
                <MediaBlock
                  asset={assets.find((asset) => asset.id === block.assetId)}
                  deckRef={deckRef}
                  deckPath={deckPath}
                  fallback={blockLabel(block)}
                />
              ) : (
                blockLabel(block)
              )}
            </Button>
          ) : (
            <span className='block p-10px text-t-tertiary text-11px'>{slot.id}</span>
          )}
        </div>
      );
    })}
  </div>
);

export default DeckCanvas;
