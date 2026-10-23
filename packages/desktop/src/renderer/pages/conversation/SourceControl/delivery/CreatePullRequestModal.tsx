/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CreatePullRequestResult } from '@/common/types/agent/taskSession';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Alert, Button, Checkbox, Input, Modal, Select, Space, Spin, Typography } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  CLI_GUIDE,
  deliveryErrorDetail,
  deliveryErrorKey,
  type HostReadiness,
  hostReadiness,
  isPullRequestFormValid,
} from './prDeliveryModel';

/** One repository the PR can be opened from. `repoPath` is a Core scm scope id (`pe:…`). */
export type PullRequestRepoOption = { repoPath: string; label: string; branch?: string };

type Props = {
  visible: boolean;
  repos: PullRequestRepoOption[];
  /** When set, Core records the PR link as evidence of this TaskRun. */
  task?: { taskSessionId: string; runId: string };
  onClose: () => void;
  onCreated?: (result: CreatePullRequestResult) => void;
};

const DEFAULT_BASE = 'main';

const Guide: React.FC<{ readiness: HostReadiness; onRecheck: () => void; checking: boolean }> = ({
  readiness,
  onRecheck,
  checking,
}) => {
  const { t } = useTranslation();
  const recheck = (
    <Button data-pr-recheck size='small' loading={checking} onClick={onRecheck}>
      {t('conversation.explorer.scm.delivery.recheck')}
    </Button>
  );
  if (readiness.kind === 'unsupportedHost') {
    return (
      <Alert
        data-pr-guide='unsupportedHost'
        type='warning'
        content={t('conversation.explorer.scm.delivery.unsupportedHost', { host: readiness.host ?? '' })}
      />
    );
  }
  if (readiness.kind === 'notInstalled') {
    const guide = CLI_GUIDE[readiness.cli];
    return (
      <Alert
        data-pr-guide='notInstalled'
        type='info'
        title={t('conversation.explorer.scm.delivery.notInstalledTitle', { cli: readiness.cli })}
        content={
          <Space direction='vertical'>
            <span>{t('conversation.explorer.scm.delivery.notInstalledContent', { cli: readiness.cli })}</span>
            <Space>
              <Button size='small' type='primary' onClick={() => void openExternalUrl(guide.installUrl)}>
                {t('conversation.explorer.scm.delivery.openInstallGuide')}
              </Button>
              {recheck}
            </Space>
          </Space>
        }
      />
    );
  }
  if (readiness.kind === 'notAuthenticated') {
    const command = CLI_GUIDE[readiness.cli].login(readiness.host);
    return (
      <Alert
        data-pr-guide='notAuthenticated'
        type='info'
        title={t('conversation.explorer.scm.delivery.notAuthenticatedTitle', { cli: readiness.cli })}
        content={
          <Space direction='vertical'>
            <span>{t('conversation.explorer.scm.delivery.notAuthenticatedContent')}</span>
            <Typography.Text code copyable data-pr-login-command>
              {command}
            </Typography.Text>
            {recheck}
          </Space>
        }
      />
    );
  }
  return null;
};

/**
 * Open a pull request (GitHub, `gh`) or merge request (GitLab, `glab`) for a
 * pushed branch. Core runs the CLI with the user's own login; the UI never sees
 * a token. When the CLI is missing or logged out the dialog shows how to fix it
 * and a re-check instead of the form.
 */
export const CreatePullRequestModal: React.FC<Props> = ({ visible, repos, task, onClose, onCreated }) => {
  const { t } = useTranslation();
  const [repoPath, setRepoPath] = useState<string | undefined>(repos[0]?.repoPath);
  const repo = useMemo(() => repos.find((item) => item.repoPath === repoPath) ?? repos[0], [repos, repoPath]);
  const [branch, setBranch] = useState(repo?.branch ?? '');
  const [base, setBase] = useState(DEFAULT_BASE);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [created, setCreated] = useState<CreatePullRequestResult>();

  useEffect(() => {
    setBranch(repo?.branch ?? '');
    setFailure(undefined);
  }, [repo?.repoPath, repo?.branch]);

  const {
    data: host,
    error: hostError,
    isValidating,
    mutate,
  } = useSWR(
    visible && repo ? ['scmDeliveryHost', repo.repoPath] : null,
    () => ipcBridge.scmDelivery.host.invoke({ repo_path: repo!.repoPath }),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const readiness = host ? hostReadiness(host) : undefined;
  const ready = readiness?.kind === 'ready';
  const formValid = isPullRequestFormValid({ title, body, branch, base });

  const submit = async () => {
    if (!repo || !ready || !formValid || submitting) return;
    setSubmitting(true);
    setFailure(undefined);
    try {
      const result = await ipcBridge.scmDelivery.createPullRequest.invoke({
        repo_path: repo.repoPath,
        branch,
        base,
        title: title.trim(),
        body,
        draft,
        ...(task ? { task_session_id: task.taskSessionId, run_id: task.runId } : {}),
      });
      setCreated(result);
      onCreated?.(result);
    } catch (error) {
      setFailure(error);
      const key = deliveryErrorKey(error);
      // The CLI state changed under us: re-check so the guide replaces the form.
      if (key === 'notInstalled' || key === 'notAuthenticated') void mutate();
    } finally {
      setSubmitting(false);
    }
  };

  const failureKey = failure === undefined ? undefined : deliveryErrorKey(failure);
  const failureDetail = deliveryErrorDetail(failure);
  const hostErrorKey = hostError === undefined ? undefined : deliveryErrorKey(hostError);

  let content: React.ReactNode;
  if (!repo) {
    content = <Alert data-pr-no-repo type='warning' content={t('conversation.explorer.scm.delivery.noRepository')} />;
  } else if (created) {
    content = (
      <Alert
        data-pr-created
        type='success'
        title={t('conversation.explorer.scm.delivery.created')}
        content={
          <Space direction='vertical'>
            <Typography.Text copyable>{created.pr_url}</Typography.Text>
            {created.evidence_id ? <span>{t('conversation.explorer.scm.delivery.evidenceRecorded')}</span> : null}
            <Button size='small' type='primary' onClick={() => void openExternalUrl(created.pr_url)}>
              {t('conversation.explorer.scm.delivery.openPullRequest')}
            </Button>
          </Space>
        }
      />
    );
  } else if (hostErrorKey) {
    content = (
      <Space direction='vertical' className='w-full'>
        <Alert
          data-pr-host-error={hostErrorKey}
          type={hostErrorKey === 'unsupported' ? 'warning' : 'error'}
          content={t(`conversation.explorer.scm.delivery.errors.${hostErrorKey}`)}
        />
        {hostErrorKey !== 'unsupported' ? (
          <Button size='small' loading={isValidating} onClick={() => void mutate()}>
            {t('conversation.explorer.scm.delivery.recheck')}
          </Button>
        ) : null}
      </Space>
    );
  } else if (!readiness) {
    content = <Spin className='self-center' />;
  } else if (!ready) {
    content = <Guide readiness={readiness} checking={isValidating} onRecheck={() => void mutate()} />;
  } else {
    content = (
      <Space direction='vertical' className='w-full' data-pr-form>
        {host?.remote_url_redacted ? (
          <Typography.Text type='secondary'>
            {t('conversation.explorer.scm.delivery.target', {
              cli: readiness.cli,
              remote: host.remote_url_redacted,
            })}
          </Typography.Text>
        ) : null}
        <Space className='w-full' align='start'>
          <Input
            data-pr-branch
            value={branch}
            onChange={setBranch}
            addBefore={t('conversation.explorer.scm.delivery.branch')}
          />
          <Input
            data-pr-base
            value={base}
            onChange={setBase}
            addBefore={t('conversation.explorer.scm.delivery.base')}
          />
        </Space>
        <Input
          data-pr-title
          value={title}
          maxLength={256}
          onChange={setTitle}
          placeholder={t('conversation.explorer.scm.delivery.titlePlaceholder')}
        />
        <Input.TextArea
          data-pr-body
          value={body}
          onChange={setBody}
          autoSize={{ minRows: 4, maxRows: 12 }}
          placeholder={t('conversation.explorer.scm.delivery.bodyPlaceholder')}
        />
        <Checkbox checked={draft} onChange={setDraft}>
          {t('conversation.explorer.scm.delivery.draft')}
        </Checkbox>
        {failureKey ? (
          <Alert
            data-pr-error={failureKey}
            type='error'
            content={
              <Space direction='vertical' className='w-full'>
                <span>{t(`conversation.explorer.scm.delivery.errors.${failureKey}`)}</span>
                {failureDetail ? (
                  <pre className='m-0 max-h-160px overflow-auto whitespace-pre-wrap break-all font-mono text-11px'>
                    {failureDetail}
                  </pre>
                ) : null}
              </Space>
            }
          />
        ) : null}
      </Space>
    );
  }

  return (
    <Modal
      visible={visible}
      title={t('conversation.explorer.scm.delivery.title')}
      unmountOnExit
      onCancel={onClose}
      className='w-640px'
      footer={
        created || !ready ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <Space>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              data-pr-submit
              type='primary'
              loading={submitting}
              disabled={!formValid}
              onClick={() => void submit()}
            >
              {t('conversation.explorer.scm.delivery.submit')}
            </Button>
          </Space>
        )
      }
    >
      <Space direction='vertical' className='w-full'>
        {repos.length > 1 ? (
          <Select
            value={repo?.repoPath}
            onChange={setRepoPath}
            aria-label={t('conversation.explorer.scm.delivery.repository')}
          >
            {repos.map((item) => (
              <Select.Option key={item.repoPath} value={item.repoPath}>
                {item.label}
              </Select.Option>
            ))}
          </Select>
        ) : null}
        {content}
      </Space>
    </Modal>
  );
};
