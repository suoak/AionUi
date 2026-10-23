/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { BranchTwo } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ScmRepository, ScmStatus } from '../scmModel';
import { CreatePullRequestModal } from './CreatePullRequestModal';
import { repoOption, useDeliverySupported } from './useDeliverySupport';

/**
 * "Create pull request" under the publish bar, once the branch tracks a remote.
 * Hidden on a Core without the delivery API.
 */
export const ScmPullRequestEntry: React.FC<{
  repo: ScmRepository;
  status: ScmStatus | undefined;
  upstream?: string;
  detached: boolean;
}> = ({ repo, status, upstream, detached }) => {
  const { t } = useTranslation();
  const supported = useDeliverySupported();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => [repoOption(repo, status)], [repo, status]);
  if (!supported || !upstream || detached) return null;
  return (
    <>
      <div className='flex justify-end'>
        <Button
          data-scm-create-pr
          size='mini'
          icon={<BranchTwo theme='outline' size='12' />}
          onClick={() => setOpen(true)}
        >
          {t('conversation.explorer.scm.delivery.open')}
        </Button>
      </div>
      {open ? <CreatePullRequestModal visible repos={options} onClose={() => setOpen(false)} /> : null}
    </>
  );
};
