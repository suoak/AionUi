/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { Folder, Terminal } from '@icon-park/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${Object.values(options).join(',')}` : key,
  }),
}));

import {
  Chip,
  ContextRing,
  EmptyState,
  KeyHint,
  PageHeader,
  RailPanel,
  SplitButton,
  StatusGlyph,
  WmIcon,
  contextFraction,
  contextRingColor,
  formatKeys,
} from '@renderer/components/design';

describe('StatusGlyph', () => {
  it.each(['working', 'needsYou', 'done', 'failed', 'idle'] as const)(
    'renders %s with a label and colour',
    (status) => {
      render(<StatusGlyph status={status} />);
      const glyph = screen.getByRole('img');
      expect(glyph.getAttribute('aria-label')).toBe(`common.designSystem.status.${status}`);
      expect(glyph.getAttribute('data-status')).toBe(status);
      expect(glyph.style.color).toContain('--wm-status-');
      expect(glyph.querySelector('svg')).not.toBeNull();
    }
  );

  it('accepts a custom label', () => {
    render(<StatusGlyph status='done' label='Merged' />);
    expect(screen.getByRole('img', { name: 'Merged' })).toBeTruthy();
  });
});

describe('WmIcon', () => {
  it('is decorative without a label', () => {
    const { container } = render(<WmIcon icon={Folder} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is announced with a label', () => {
    render(<WmIcon icon={Folder} label='Files' />);
    expect(screen.getByRole('img', { name: 'Files' })).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders title, description and fires the primary action', () => {
    const onClick = vi.fn();
    render(
      <EmptyState icon={Folder} title='No tasks yet' description='Start one.' action={{ label: 'New task', onClick }} />
    );
    expect(screen.getByText('No tasks yet')).toBeTruthy();
    expect(screen.getByText('Start one.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom action node', () => {
    render(<EmptyState title='Empty' action={<span>custom</span>} size='compact' />);
    expect(screen.getByText('custom')).toBeTruthy();
  });
});

describe('PageHeader', () => {
  it('renders title, description, actions and back', () => {
    const onBack = vi.fn();
    render(<PageHeader title='Tasks' description='All runs' actions={<span>act</span>} onBack={onBack} />);
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy();
    expect(screen.getByText('All runs')).toBeTruthy();
    expect(screen.getByText('act')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Chip', () => {
  it('shows the label and a remove control when removable', () => {
    const onRemove = vi.fn();
    const { container } = render(<Chip label='README.md' onRemove={onRemove} />);
    expect(screen.getByText('README.md')).toBeTruthy();
    const close = container.querySelector('.arco-tag-close-btn');
    expect(close).not.toBeNull();
    fireEvent.click(close!);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('is not removable without onRemove', () => {
    const { container } = render(<Chip label='@claude' tone='accent' />);
    expect(container.querySelector('.arco-tag-close-btn')).toBeNull();
  });
});

describe('KeyHint', () => {
  it('formats shortcuts per platform', () => {
    expect(formatKeys(['Mod', 'K'], true)).toBe('⌘K');
    expect(formatKeys(['Mod', 'K'], false)).toBe('Ctrl+K');
    expect(formatKeys(['Mod', 'Shift', 'p'], false)).toBe('Ctrl+Shift+P');
    expect(formatKeys(['Mod', 'Enter'], true)).toBe('⌘↵');
  });

  it('renders left-to-right even in RTL layouts', () => {
    const { container } = render(<KeyHint keys={['Mod', 'J']} />);
    expect(container.querySelector('kbd')?.getAttribute('dir')).toBe('ltr');
  });
});

describe('ContextRing', () => {
  it('clamps the fraction and handles empty totals', () => {
    expect(contextFraction(50, 100)).toBe(0.5);
    expect(contextFraction(500, 100)).toBe(1);
    expect(contextFraction(10, 0)).toBe(0);
    expect(contextFraction(-1, 100)).toBe(0);
  });

  it('switches colour at 80 % and 95 %', () => {
    expect(contextRingColor(0.5)).toBe('var(--wm-accent)');
    expect(contextRingColor(0.85)).toBe('var(--wm-status-needs-you)');
    expect(contextRingColor(0.99)).toBe('var(--wm-status-failed)');
  });

  it('labels the ring with the rounded percentage', () => {
    render(<ContextRing used={1234} total={10000} />);
    const ring = screen.getByRole('img');
    expect(ring.getAttribute('data-percent')).toBe('12');
    expect(ring.getAttribute('aria-label')).toBe('common.designSystem.contextUsage:12');
  });
});

describe('RailPanel', () => {
  const items = [
    { key: 'files', icon: Folder, label: 'Files' },
    { key: 'terminal', icon: Terminal, label: 'Terminal', badge: 2 },
  ];

  it('opens a panel, and clicking the active item collapses it', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RailPanel items={items} activeKey={null} onChange={onChange}>
        <div>panel</div>
      </RailPanel>
    );
    expect(screen.queryByTestId('wm-rail-panel-content')).toBeNull();
    fireEvent.click(screen.getByTestId('wm-rail-item-files'));
    expect(onChange).toHaveBeenLastCalledWith('files');

    rerender(
      <RailPanel items={items} activeKey='files' onChange={onChange}>
        <div>panel</div>
      </RailPanel>
    );
    expect(screen.getByTestId('wm-rail-panel-content').textContent).toBe('panel');
    expect(screen.getByTestId('wm-rail-item-files').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByTestId('wm-rail-item-files'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores an unknown active key', () => {
    render(<RailPanel items={items} activeKey='nope' onChange={vi.fn()} />);
    expect(screen.queryByTestId('wm-rail-panel-content')).toBeNull();
  });
});

describe('SplitButton', () => {
  it('fires the primary action and exposes a labelled menu trigger', () => {
    const onClick = vi.fn();
    render(
      <SplitButton
        label='Adopt'
        onClick={onClick}
        options={[{ key: 'pr', label: 'Open PR' }]}
        onSelect={vi.fn()}
        menuLabel='More adopt options'
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'More adopt options' })).toBeTruthy();
  });
});
