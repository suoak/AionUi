/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Input, Modal, Space, Typography } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { ImportGithubIssuesResult } from '@/common/types/agent/taskSession';
import {
  GITHUB_IMPORT_REPO_KEY,
  buildGithubImportInput,
  githubImportErrorKey,
  isValidGithubRepo,
  type GithubImportErrorKey,
} from './githubImportModel';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful import so the board can refresh. */
  onImported: (result: ImportGithubIssuesResult) => void;
};

const readLastRepo = (): string => {
  try {
    return window.localStorage.getItem(GITHUB_IMPORT_REPO_KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * M8 E6-7: manual, read-only GitHub Issue import. Open issues of one
 * repository land in the backlog (unassigned); importing again refreshes
 * title / description / labels only. Nothing is written back to GitHub.
 */
const GithubIssueImportModal: React.FC<Props> = ({ visible, onClose, onImported }) => {
  const { t } = useTranslation();
  const [repo, setRepo] = useState('');
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportGithubIssuesResult | null>(null);
  const [errorKey, setErrorKey] = useState<GithubImportErrorKey | null>(null);

  useEffect(() => {
    if (!visible) return;
    setRepo(readLastRepo());
    setQuery('');
    setResult(null);
    setErrorKey(null);
  }, [visible]);

  const repoValid = isValidGithubRepo(repo);

  const submit = async () => {
    if (!repoValid || submitting) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const response = await ipcBridge.taskSession.board.importGithub.invoke(buildGithubImportInput(repo, query));
      setResult(response);
      try {
        window.localStorage.setItem(GITHUB_IMPORT_REPO_KEY, repo.trim());
      } catch {
        // Storage unavailable: the repo just is not remembered.
      }
      onImported(response);
    } catch (error) {
      console.error('[TasksBoard] GitHub import failed:', error);
      setErrorKey(githubImportErrorKey(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={t('conversation.taskBoard.githubImport.title')}
      unmountOnExit
      onCancel={onClose}
      className='w-560px'
      footer={
        result ? (
          <Button data-testid='github-import-close' onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <Space>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              data-testid='github-import-submit'
              type='primary'
              loading={submitting}
              disabled={!repoValid}
              onClick={() => void submit()}
            >
              {t('conversation.taskBoard.githubImport.submit')}
            </Button>
          </Space>
        )
      }
    >
      <Space direction='vertical' className='w-full' size={12}>
        <Typography.Text type='secondary'>{t('conversation.taskBoard.githubImport.hint')}</Typography.Text>
        <Input
          data-testid='github-import-repo'
          value={repo}
          onChange={setRepo}
          disabled={Boolean(result)}
          addBefore={t('conversation.taskBoard.githubImport.repo')}
          placeholder='owner/name'
          status={repo && !repoValid ? 'error' : undefined}
          onPressEnter={() => void submit()}
        />
        <Input
          data-testid='github-import-query'
          value={query}
          onChange={setQuery}
          disabled={Boolean(result)}
          maxLength={256}
          addBefore={t('conversation.taskBoard.githubImport.query')}
          placeholder={t('conversation.taskBoard.githubImport.queryPlaceholder')}
          onPressEnter={() => void submit()}
        />
        {result ? (
          <Alert
            data-testid='github-import-result'
            type='success'
            content={t('conversation.taskBoard.githubImport.result', {
              created: result.created,
              updated: result.updated,
              unchanged: result.unchanged,
            })}
          />
        ) : null}
        {errorKey ? (
          <Alert
            data-testid='github-import-error'
            data-error={errorKey}
            type='error'
            content={t(`conversation.taskBoard.githubImport.errors.${errorKey}`)}
          />
        ) : null}
      </Space>
    </Modal>
  );
};

export default GithubIssueImportModal;
