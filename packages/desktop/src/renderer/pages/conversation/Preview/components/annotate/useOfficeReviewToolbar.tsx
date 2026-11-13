/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { usePreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { Button } from '@arco-design/web-react';
import { Comments } from '@icon-park/react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { countUnresolved } from './annotateModel';
import type { useReviewThreads } from './useReviewThreads';

type ReviewState = Pick<ReturnType<typeof useReviewThreads>, 'ready' | 'threads'>;

type Params = {
  review: ReviewState;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

/** "Review (N)" toggle in PreviewToolbar, with a fallback button when no extras context exists. */
export const useOfficeReviewToolbar = ({ review, open, setOpen }: Params) => {
  const { t } = useTranslation();
  const toolbarExtrasContext = usePreviewToolbarExtras();
  const unresolved = countUnresolved(review.threads);

  const toggleButton = review.ready ? (
    <Button
      size='small'
      type={open ? 'primary' : 'text'}
      icon={<Comments />}
      data-testid='office-review-toggle'
      onClick={() => setOpen((value) => !value)}
    >
      {t('preview.officeReview.toggle', { count: unresolved })}
    </Button>
  ) : null;

  useEffect(() => {
    if (!toolbarExtrasContext) return;
    if (!toggleButton) {
      toolbarExtrasContext.setExtras(null);
      return;
    }
    toolbarExtrasContext.setExtras({ right: toggleButton });
    return () => toolbarExtrasContext.setExtras(null);
  }, [toolbarExtrasContext, review.ready, unresolved, open, t]);

  return {
    unresolved,
    showFallbackToggle: Boolean(toggleButton) && !toolbarExtrasContext,
    toggleButton,
  };
};
