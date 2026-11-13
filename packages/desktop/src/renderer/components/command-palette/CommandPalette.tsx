/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Input, Modal, Typography } from '@arco-design/web-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  PALETTE_GROUP_ORDER,
  STATIC_PALETTE_COMMANDS,
  buildPaletteSections,
  type CommandGroup,
  type PaletteCommand,
} from './commandRegistry';
import type { DynamicSourceKey } from './dynamicCommands';
import { usePaletteDynamicCommands } from './usePaletteDynamicCommands';

const { Text } = Typography;

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  /** Static commands (navigation / agents / settings). */
  commands?: readonly PaletteCommand[];
  /** Load Sessions / Work items / Agents from existing bridges when opened. */
  dynamic?: boolean;
};

const GROUP_LABEL_DEFAULTS: Record<CommandGroup, string> = {
  navigation: 'Navigation',
  sessions: 'Sessions',
  workItems: 'Work items',
  agents: 'Agents',
  settings: 'Settings',
};

const DYNAMIC_GROUPS: ReadonlySet<CommandGroup> = new Set<CommandGroup>(['sessions', 'workItems', 'agents']);

const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  commands = STATIC_PALETTE_COMMANDS,
  dynamic = true,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { commands: dynamicCommands, sources } = usePaletteDynamicCommands(open, dynamic);

  const allCommands = useMemo(
    () => (dynamic ? [...commands, ...dynamicCommands] : [...commands]),
    [commands, dynamicCommands, dynamic]
  );
  const sections = useMemo(() => buildPaletteSections(allCommands, query), [allCommands, query]);
  const flat = useMemo(() => sections.flatMap((s) => s.commands), [sections]);

  const loadingGroups = useMemo(() => {
    if (!dynamic) return new Set<CommandGroup>();
    const out = new Set<CommandGroup>();
    for (const key of Object.keys(sources) as DynamicSourceKey[]) {
      if (sources[key].status === 'loading') out.add(key);
    }
    return out;
  }, [dynamic, sources]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Dynamic groups arrive after open: keep the selection in range.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const runCommand = (cmd: PaletteCommand) => {
    if (cmd.path) {
      navigate(cmd.path);
    }
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const cmd = flat[activeIndex];
      if (cmd) runCommand(cmd);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const groupLabel = (group: CommandGroup) =>
    t(`common.commandPalette.groups.${group}`, { defaultValue: GROUP_LABEL_DEFAULTS[group] });

  const pendingGroupsWithoutRows = PALETTE_GROUP_ORDER.filter(
    (g) => DYNAMIC_GROUPS.has(g) && loadingGroups.has(g) && !sections.some((s) => s.group === g)
  );

  let flatIndex = 0;

  return (
    <Modal
      visible={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      unmountOnExit
      style={{ width: 560 }}
      className='workmate-command-palette'
      data-testid='command-palette'
    >
      <Input
        ref={inputRef as never}
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        placeholder={t('common.commandPalette.placeholder', { defaultValue: 'Search sessions, work items, agents…' })}
        allowClear
        data-testid='command-palette-input'
        autoComplete='off'
      />
      <div ref={listRef} className='mt-12px max-h-360px overflow-auto flex flex-col gap-8px' role='listbox'>
        {flat.length === 0 && pendingGroupsWithoutRows.length === 0 ? (
          <Text type='secondary' data-testid='command-palette-empty'>
            {t('common.commandPalette.empty', { defaultValue: 'No matching commands' })}
          </Text>
        ) : null}
        {sections.map((section) => (
          <div
            key={section.group}
            role='group'
            aria-label={groupLabel(section.group)}
            data-testid={`command-palette-group-${section.group}`}
            className='flex flex-col gap-2px'
          >
            <Text type='secondary' className='px-12px text-11px uppercase tracking-wide'>
              {groupLabel(section.group)}
            </Text>
            {section.commands.map((cmd) => {
              const index = flatIndex++;
              const subtitle = cmd.subtitleKey ? t(cmd.subtitleKey, { defaultValue: '' }) : '';
              return (
                <button
                  key={cmd.id}
                  type='button'
                  role='option'
                  aria-selected={index === activeIndex}
                  data-testid={`command-palette-item-${cmd.id}`}
                  className={`text-left px-12px py-8px rounded-6px border-0 cursor-pointer ${
                    index === activeIndex ? 'bg-[var(--color-fill-2)]' : 'bg-transparent'
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runCommand(cmd)}
                >
                  <div className='font-medium text-13px truncate'>
                    {cmd.title || t('common.commandPalette.untitled', { defaultValue: 'Untitled' })}
                  </div>
                  <Text type='secondary' className='text-12px truncate'>
                    {subtitle || cmd.path || groupLabel(cmd.group)}
                  </Text>
                </button>
              );
            })}
          </div>
        ))}
        {pendingGroupsWithoutRows.map((group) => (
          <div key={group} data-testid={`command-palette-loading-${group}`} className='px-12px'>
            <Text type='secondary' className='text-12px'>
              {groupLabel(group)} · {t('common.commandPalette.loading', { defaultValue: 'Loading…' })}
            </Text>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default CommandPalette;
