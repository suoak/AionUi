/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel: () => void;
};

/**
 * Markdown comment box. `Enter` or `Cmd/Ctrl+Enter` saves, `Shift+Enter` adds
 * a line, `Esc` cancels. IME composition never submits.
 */
const CommentComposer: React.FC<Props> = ({ placeholder, submitLabel, initialValue = '', onSubmit, onCancel }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const body = value.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const ok = await onSubmit(body);
      if (ok) setValue('');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className='flex flex-col gap-6px p-8px' data-review-composer=''>
      <Input.TextArea
        autoFocus
        value={value}
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 10 }}
        onChange={setValue}
        onKeyDown={onKeyDown}
      />
      <div className='flex items-center justify-between gap-8px'>
        <span className='text-11px text-t-secondary'>{t('preview.annotate.shortcutHint')}</span>
        <div className='flex items-center gap-6px'>
          <Button size='mini' onClick={onCancel}>
            {t('preview.annotate.cancel')}
          </Button>
          <Button size='mini' type='primary' loading={saving} disabled={!value.trim()} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CommentComposer;
