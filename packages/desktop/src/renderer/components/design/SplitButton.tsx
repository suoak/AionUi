/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React from 'react';
import WmIcon from './WmIcon';

export type SplitButtonOption = {
  key: string;
  label: string;
  disabled?: boolean;
};

export type SplitButtonProps = {
  label: string;
  onClick: () => void;
  /** Alternatives shown in the attached menu (e.g. "Open PR" next to "Adopt"). */
  options: SplitButtonOption[];
  onSelect: (key: string) => void;
  type?: 'primary' | 'secondary';
  size?: 'mini' | 'small' | 'default' | 'large';
  disabled?: boolean;
  loading?: boolean;
  /** Accessible name for the menu trigger. */
  menuLabel: string;
};

/** Primary action with a dropdown of alternatives, built on Arco `Dropdown.Button`. */
const SplitButton: React.FC<SplitButtonProps> = ({
  label,
  onClick,
  options,
  onSelect,
  type = 'primary',
  size = 'default',
  disabled,
  loading,
  menuLabel,
}) => (
  <Dropdown.Button
    type={type}
    size={size}
    disabled={disabled}
    onClick={onClick}
    icon={<WmIcon icon={Down} size={12} label={menuLabel} />}
    buttonProps={{ loading }}
    droplist={
      <Menu onClickMenuItem={onSelect}>
        {options.map((option) => (
          <Menu.Item key={option.key} disabled={option.disabled}>
            {option.label}
          </Menu.Item>
        ))}
      </Menu>
    }
  >
    {label}
  </Dropdown.Button>
);

export default SplitButton;
