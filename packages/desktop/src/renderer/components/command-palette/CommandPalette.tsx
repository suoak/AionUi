/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Input, Modal, Typography } from '@arco-design/web-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STATIC_PALETTE_COMMANDS, filterPaletteCommands, type PaletteCommand } from './commandRegistry';

const { Text } = Typography;

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  commands?: readonly PaletteCommand[];
};

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands = STATIC_PALETTE_COMMANDS }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => filterPaletteCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runCommand = (cmd: PaletteCommand) => {
    if (cmd.path) {
      navigate(cmd.path);
    }
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) runCommand(cmd);
    }
  };

  return (
    <Modal
      visible={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      unmountOnExit
      style={{ width: 520 }}
      className='workmate-command-palette'
      data-testid='command-palette'
    >
      <Input
        ref={inputRef as never}
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        placeholder='Type a command…'
        allowClear
        data-testid='command-palette-input'
        autoComplete='off'
      />
      <div className='mt-12px max-h-320px overflow-auto flex flex-col gap-4px' role='listbox'>
        {filtered.length === 0 ? (
          <Text type='secondary' data-testid='command-palette-empty'>
            No matching commands
          </Text>
        ) : (
          filtered.map((cmd, index) => (
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
              <div className='font-medium text-13px'>{cmd.title}</div>
              <Text type='secondary' className='text-12px'>
                {cmd.group}
                {cmd.path ? ` · ${cmd.path}` : ''}
              </Text>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
};

export default CommandPalette;
