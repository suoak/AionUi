/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Icon } from '@icon-park/react/es/runtime';
import React from 'react';

export type WmIconProps = {
  icon: Icon;
  /** Pixel size; 16 in chrome, 20 in empty states. */
  size?: number;
  className?: string;
  /** Accessible label. Without it the icon is decorative and hidden from assistive tech. */
  label?: string;
};

/** IconPark icon with the design-system defaults: outline, 16 px, current colour. */
const WmIcon: React.FC<WmIconProps> = ({ icon: IconComponent, size = 16, className, label }) => (
  <IconComponent
    theme='outline'
    size={size}
    strokeWidth={3}
    fill='currentColor'
    className={className}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? 'img' : undefined}
  />
);

export default WmIcon;
