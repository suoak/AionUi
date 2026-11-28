import MentionMenuShell from '@/renderer/components/chat/MentionMenuShell';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import type { AssistantMentionItem } from '@/renderer/utils/chat/assistantMention';
import React from 'react';

/** Rows here are two lines tall, so the shell's single-line cap would only show
 *  a handful. */
const MAX_HEIGHT = 'min(40vh, 320px)';

type AtFileMenuProps = {
  activeIndex: number;
  emptyText: string;
  items: FileOrFolderItem[];
  label: string;
  loading: boolean;
  loadingText: string;
  onHoverItem: (index: number) => void;
  onSelectItem: (item: FileOrFolderItem) => void;
  /** Secondary line for an item. Defaults to its relative/absolute path; the
   *  project path passes `PE_NAME · REL` here to disambiguate multi-folder hits. */
  getSubtitle?: (item: FileOrFolderItem) => string;
  /** 3.0 U7: assistants to delegate to, listed above the files. `activeIndex`
   *  counts them first, so index `assistants.length` is the first file. */
  assistants?: AssistantMentionItem[];
  assistantsLabel?: string;
  filesLabel?: string;
  onSelectAssistant?: (item: AssistantMentionItem) => void;
};

/**
 * The `@` picker's dropdown. Scrolling and the height cap belong to
 * `MentionMenuShell` — a workspace search can return far more rows than fit
 * above the send box.
 */
const AtFileMenu: React.FC<AtFileMenuProps> = ({
  activeIndex,
  emptyText,
  items,
  label,
  loading,
  loadingText,
  onHoverItem,
  onSelectItem,
  getSubtitle,
  assistants = [],
  assistantsLabel,
  filesLabel,
  onSelectAssistant,
}) => {
  const offset = assistants.length;
  const groupHeader = (text?: string) =>
    offset > 0 && text ? (
      <div
        className='px-12px pt-6px pb-2px text-11px font-medium text-t-tertiary uppercase select-none'
        role='presentation'
      >
        {text}
      </div>
    ) : null;
  return (
    <MentionMenuShell
      activeIndex={activeIndex}
      itemCount={offset + items.length}
      label={label}
      loading={loading}
      maxHeight={MAX_HEIGHT}
      bodyClassName='flex flex-col gap-2px'
    >
      {offset > 0 ? (
        <div role='group' aria-label={assistantsLabel} data-testid='at-menu-assistants'>
          {groupHeader(assistantsLabel)}
          {assistants.map((assistant, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={`assistant:${assistant.id}`}
                role='option'
                aria-selected={isActive}
                data-testid={`at-menu-assistant-${assistant.id}`}
                className='px-12px py-8px rounded-10px cursor-pointer transition-colors shrink-0'
                style={{ background: isActive ? 'var(--color-fill-2)' : 'transparent' }}
                onMouseEnter={() => onHoverItem(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelectAssistant?.(assistant);
                }}
              >
                <div className='text-13px font-medium text-t-primary'>@{assistant.name}</div>
                {assistant.description ? (
                  <div className='text-12px text-t-secondary truncate'>{assistant.description}</div>
                ) : null}
              </div>
            );
          })}
          {groupHeader(filesLabel)}
        </div>
      ) : null}
      {items.length === 0 ? (
        <div className='px-12px py-10px text-12px text-t-secondary'>{loading ? loadingText : emptyText}</div>
      ) : (
        items.map((item, fileIndex) => {
          const index = offset + fileIndex;
          const isActive = index === activeIndex;
          return (
            <div
              key={item.path}
              role='option'
              aria-selected={isActive}
              className='px-12px py-8px rounded-10px cursor-pointer transition-colors shrink-0'
              style={{
                background: isActive ? 'var(--color-fill-2)' : 'transparent',
              }}
              onMouseEnter={() => {
                onHoverItem(index);
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelectItem(item);
              }}
            >
              <div className='text-13px font-medium text-t-primary'>{item.name}</div>
              <div className='text-12px text-t-secondary break-all'>
                {getSubtitle ? getSubtitle(item) : item.relativePath || item.path}
              </div>
            </div>
          );
        })
      )}
    </MentionMenuShell>
  );
};

export default AtFileMenu;
