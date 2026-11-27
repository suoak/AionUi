/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import appMark from '@renderer/assets/logos/brand/app.png';
import classNames from 'classnames';
import React from 'react';

/**
 * Single-colour mark (an SVG drawn in one colour, tinted with currentColor).
 * None ships yet: until the artwork is provided, `variant='mono'` renders the
 * colour mark so nothing on screen changes. Register the asset here, e.g.
 * `import monoMark from '@renderer/assets/logos/brand/mark-mono.svg'`.
 */
export const MONO_MARK_SRC: string | null = null;

export type BrandMarkProps = {
  /** Edge length in px. */
  size: number;
  /** `color` is the app icon; `mono` follows the surrounding text colour. */
  variant?: 'color' | 'mono';
  /** Accessible name; omit when the brand name is shown next to the mark. */
  label?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  'data-testid'?: string;
};

/** The CSBU WorkMate mark, used wherever the app shows its own logo. */
const BrandMark: React.FC<BrandMarkProps> = ({
  size,
  variant = 'color',
  label,
  className,
  onClick,
  'data-testid': testId,
}) => {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  const box = { width: size, height: size };

  if (variant === 'mono' && MONO_MARK_SRC) {
    const mask = `url("${MONO_MARK_SRC}") center / contain no-repeat`;
    return (
      <span
        {...a11y}
        data-testid={testId}
        data-variant='mono'
        className={classNames('inline-block shrink-0', className)}
        style={{ ...box, backgroundColor: 'currentColor', mask, WebkitMask: mask }}
        onClick={onClick}
      />
    );
  }

  return (
    <span
      data-testid={testId}
      data-variant='color'
      className={classNames('inline-block shrink-0 overflow-hidden', className)}
      style={{ ...box, borderRadius: Math.round(size * 0.25) }}
      onClick={onClick}
    >
      <img className='size-full block' src={appMark} alt={label ?? ''} {...(label ? {} : { 'aria-hidden': true })} />
    </span>
  );
};

export default BrandMark;
