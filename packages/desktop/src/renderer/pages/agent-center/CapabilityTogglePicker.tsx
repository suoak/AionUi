import { Checkbox, Empty, Typography } from '@arco-design/web-react';
import { WorkMateInlineSearchInput } from '@renderer/components/base';
import { DROPDOWN_SEARCH_THRESHOLD } from '@renderer/components/agent/runtimeSelectorOptions';
import React, { useMemo, useState } from 'react';

const { Text } = Typography;

export type CapabilityToggleItem = {
  id: string;
  name: string;
  description?: string;
  disabled?: boolean;
};

type CapabilityTogglePickerProps = {
  items: CapabilityToggleItem[];
  value: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder: string;
  emptyText: string;
  /** Optional footer hint under the list (e.g. MCP empty allowlist copy). */
  footerHint?: React.ReactNode;
  testId?: string;
};

/**
 * ChatGPT-like capability toggles: searchable multi-select checkboxes showing
 * display names (not raw ids). Used by Agent Center capability step for Skills
 * and MCP allowlist.
 */
const CapabilityTogglePicker: React.FC<CapabilityTogglePickerProps> = ({
  items,
  value,
  onChange,
  searchPlaceholder,
  emptyText,
  footerHint,
  testId,
}) => {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(value), [value]);
  const showSearch = items.length > DROPDOWN_SEARCH_THRESHOLD;

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [item.name, item.description, item.id].some((field) => field?.toLowerCase().includes(keyword))
    );
  }, [items, query]);

  const toggle = (id: string) => {
    if (selected.has(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    onChange([...value, id]);
  };

  return (
    <div className='flex flex-col gap-8px' data-testid={testId}>
      <div className='flex items-center justify-between gap-8px'>
        <Text type='secondary' className='text-12px'>
          已选 {value.length}
          {items.length > 0 ? ` / ${items.length}` : ''}
        </Text>
        {value.length > 0 ? (
          <button
            type='button'
            className='text-12px text-primary-6 bg-transparent border-0 cursor-pointer p-0'
            onClick={() => onChange([])}
          >
            清空选择
          </button>
        ) : null}
      </div>
      {showSearch ? (
        <WorkMateInlineSearchInput
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
          data-testid={testId ? `${testId}-search` : undefined}
        />
      ) : null}
      <div className='max-h-220px overflow-auto rounded-8px border border-[var(--color-border-2)] bg-[var(--color-bg-1)]'>
        {filtered.length === 0 ? (
          <div className='py-16px'>
            <Empty description={emptyText} />
          </div>
        ) : (
          <ul className='m-0 p-0 list-none'>
            {filtered.map((item) => {
              const checked = selected.has(item.id);
              return (
                <li
                  key={item.id}
                  className='flex items-start gap-8px px-12px py-10px border-b border-[var(--color-border-1)] last:border-b-0 cursor-pointer hover:bg-[var(--color-fill-1)]'
                  onClick={() => {
                    if (!item.disabled) toggle(item.id);
                  }}
                >
                  <Checkbox
                    checked={checked}
                    disabled={item.disabled}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    onChange={() => toggle(item.id)}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='text-13px text-t-primary truncate'>{item.name}</div>
                    {item.description ? (
                      <div className='text-11px text-t-tertiary line-clamp-2 mt-2px'>{item.description}</div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {footerHint ? (
        <Text type='secondary' className='text-12px'>
          {footerHint}
        </Text>
      ) : null}
    </div>
  );
};

export default CapabilityTogglePicker;
