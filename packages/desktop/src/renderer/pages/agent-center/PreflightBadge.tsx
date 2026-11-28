/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentPreflight } from '@/common/types/agent/agentPreflight';
import { Button, Tag, Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { problemChecks } from './useAgentPreflight';

const COLOR = { pass: 'green', warn: 'orange', fail: 'red' } as const;

/**
 * 3.0 U4: PASS / WARN / FAIL for the runtime an agent uses, the failing
 * checks on hover, and a Fix button that opens the runtime's repair page.
 */
const PreflightBadge: React.FC<{ preflight: AgentPreflight | undefined; showFix?: boolean }> = ({
  preflight,
  showFix = true,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!preflight) return null;
  const problems = problemChecks(preflight);
  const tag = (
    <Tag size='small' color={COLOR[preflight.level]} data-testid='agent-preflight-badge' data-level={preflight.level}>
      {t(`agent.agentCenter.preflight.level.${preflight.level}`)}
    </Tag>
  );
  return (
    <span className='inline-flex items-center gap-6px'>
      {problems.length > 0 ? (
        <Tooltip
          content={
            <ul className='m-0 ps-16px'>
              {problems.map((check) => (
                <li key={check.key}>
                  {t(`agent.agentCenter.preflight.check.${check.key}`)}: {check.message}
                </li>
              ))}
            </ul>
          }
        >
          {tag}
        </Tooltip>
      ) : (
        tag
      )}
      {showFix && !preflight.ready ? (
        <Button
          size='mini'
          type='text'
          data-testid='agent-preflight-fix'
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/settings/agent/${encodeURIComponent(preflight.id)}/repair`);
          }}
        >
          {t('agent.agentCenter.preflight.fix')}
        </Button>
      ) : null}
    </span>
  );
};

export default PreflightBadge;
