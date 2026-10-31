/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Drawer, Input, InputNumber, Message, Radio, Select } from '@arco-design/web-react';
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  BATCH_CHECK_KINDS,
  BATCH_MAX_CHECKS,
  BATCH_MAX_CONCURRENCY,
  BATCH_MAX_ITEM_TIMEOUT_SEC,
  BATCH_MAX_TITLE_CHARS,
  BATCH_MAX_TRIAL_SIZE,
  BATCH_MIN_ITEM_TIMEOUT_SEC,
  type BatchCheckKind,
  type BatchJob,
} from '@/common/types/agent/batch';
import {
  buildCheck,
  buildCreateRequest,
  batchErrorKey,
  batchErrorReason,
  defaultBatchForm,
  newCheckDraft,
  parseTargets,
  type BatchForm,
  type CheckDraft,
  type TargetIssue,
} from './batchModel';

const F = 'conversation.batchJobs.form';
const MAX_ISSUES_SHOWN = 5;

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreated: (job: BatchJob) => void;
};

const assistantLabel = (a: Assistant, lang: string) => a.name_i18n?.[lang] || a.name;

/**
 * M8 E8-5: create a batch job (draft). Template + targets (pasted JSON /
 * JSON Lines / CSV / one path per line) + artifact checks + concurrency /
 * timeout / trial size. Core re-validates; its 400 reason is shown as is.
 * Creating never runs anything — the trial is a separate, explicit step.
 */
const BatchCreateDrawer: React.FC<Props> = ({ visible, onClose, onCreated }) => {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<BatchForm>(defaultBatchForm);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{ key: string; reason: string | null } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    ipcBridge.assistants.list
      .invoke()
      .then((list) => {
        if (!alive) return;
        const enabled = (list ?? []).filter((a) => a.enabled);
        setAssistants(enabled);
        // Preselect the first enabled assistant; the user can switch.
        setForm((f) => (f.assistantId || enabled.length === 0 ? f : { ...f, assistantId: enabled[0].id }));
      })
      .catch(() => {
        if (alive) setAssistants([]);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const patch = (p: Partial<BatchForm>) => setForm((f) => ({ ...f, ...p }));
  const patchCheck = (key: string, p: Partial<CheckDraft>) =>
    setForm((f) => ({ ...f, checks: f.checks.map((c) => (c.key === key ? { ...c, ...p } : c)) }));

  const parsed = useMemo(
    () => parseTargets(form.targetsText, form.pathKind, form.prompt),
    [form.targetsText, form.pathKind, form.prompt]
  );
  const built = useMemo(() => buildCreateRequest(form), [form]);

  const issueText = (issue: TargetIssue) =>
    t(`${F}.targetIssues.${issue.code}`, {
      index: issue.index + 1,
      path: 'path' in issue ? issue.path : '',
      field: 'field' in issue ? issue.field : '',
    });

  const reset = () => {
    setForm(defaultBatchForm());
    setSubmitted(false);
    setServerError(null);
  };

  const submit = async () => {
    setSubmitted(true);
    setServerError(null);
    if (!built.request) return;
    setSubmitting(true);
    try {
      const job = await ipcBridge.batch.create.invoke(built.request);
      Message.success(t('conversation.batchJobs.created'));
      reset();
      onCreated(job);
    } catch (error) {
      const key = batchErrorKey(error);
      setServerError({ key, reason: batchErrorReason(error) });
      Message.error(t(key));
    } finally {
      setSubmitting(false);
    }
  };

  const label = (text: string) => <div className='text-13px text-t-primary font-medium mb-6px'>{text}</div>;
  const hint = (text: string) => <div className='text-12px text-t-tertiary mt-4px'>{text}</div>;

  return (
    <Drawer
      visible={visible}
      width={640}
      title={t('conversation.batchJobs.createTitle')}
      onCancel={onClose}
      unmountOnExit
      footer={
        <div className='flex justify-end gap-8px'>
          <Button onClick={onClose}>{t(`${F}.cancel`)}</Button>
          <Button type='primary' loading={submitting} onClick={() => void submit()} data-testid='batch-create-submit'>
            {t(`${F}.submit`)}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-18px' data-testid='batch-create-form'>
        <Alert type='info' content={t(`${F}.intro`)} />
        <div>
          {label(t(`${F}.title`))}
          <Input
            value={form.title}
            maxLength={BATCH_MAX_TITLE_CHARS}
            placeholder={t(`${F}.titlePlaceholder`)}
            onChange={(v) => patch({ title: v })}
            data-testid='batch-form-title'
          />
        </div>
        <div>
          {label(t(`${F}.assistant`))}
          <Select
            value={form.assistantId || undefined}
            placeholder={t(`${F}.assistantPlaceholder`)}
            onChange={(v: string) => patch({ assistantId: v })}
            data-testid='batch-form-assistant'
            options={assistants.map((a) => ({ label: assistantLabel(a, i18n.language), value: a.id }))}
          />
          {hint(t(`${F}.assistantHint`))}
        </div>
        <div>
          {label(t(`${F}.prompt`))}
          <Input.TextArea
            value={form.prompt}
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder={t(`${F}.promptPlaceholder`)}
            onChange={(v) => patch({ prompt: v })}
            data-testid='batch-form-prompt'
          />
          {hint(t(`${F}.promptHint`, { field: '{{target.name}}', target: '{{target}}', seq: '{{seq}}' }))}
        </div>
        <div>
          <div className='flex items-center justify-between mb-6px'>
            <span className='text-13px text-t-primary font-medium'>{t(`${F}.targets`)}</span>
            <Radio.Group type='button' size='mini' value={form.pathKind} onChange={(v) => patch({ pathKind: v })}>
              <Radio value='repo'>{t(`${F}.pathKindRepo`)}</Radio>
              <Radio value='workspace'>{t(`${F}.pathKindWorkspace`)}</Radio>
            </Radio.Group>
          </div>
          <Input.TextArea
            value={form.targetsText}
            autoSize={{ minRows: 4, maxRows: 12 }}
            placeholder={t(`${F}.targetsPlaceholder`)}
            onChange={(v) => patch({ targetsText: v })}
            className='font-mono'
            data-testid='batch-form-targets'
          />
          {hint(t(`${F}.targetsHint`))}
          <div className='mt-6px text-12px' data-testid='batch-form-targets-preview'>
            {parsed.error && form.targetsText.trim() ? (
              <span className='text-[rgb(var(--red-6))]'>{t(`${F}.targetErrors.${parsed.error}`)}</span>
            ) : parsed.targets.length > 0 ? (
              <span className='text-t-secondary'>{t(`${F}.targetCount`, { count: parsed.targets.length })}</span>
            ) : null}
            {parsed.issues.slice(0, MAX_ISSUES_SHOWN).map((issue, i) => (
              <div key={i} className='text-[rgb(var(--red-6))]'>
                {issueText(issue)}
              </div>
            ))}
            {parsed.issues.length > MAX_ISSUES_SHOWN && (
              <div className='text-t-tertiary'>
                {t(`${F}.moreIssues`, { count: parsed.issues.length - MAX_ISSUES_SHOWN })}
              </div>
            )}
          </div>
        </div>
        <div>
          {label(t(`${F}.checks`))}
          {hint(t(`${F}.checksHint`))}
          <div className='flex flex-col gap-10px mt-8px'>
            {form.checks.map((check, index) => {
              const issue = submitted ? buildCheck(check).issue : null;
              return (
                <div
                  key={check.key}
                  className='flex flex-col gap-6px p-10px rd-8px bg-fill-1'
                  data-testid={`batch-form-check-${index}`}
                >
                  <div className='flex items-center gap-8px'>
                    <Select
                      size='small'
                      className='w-160px'
                      value={check.kind}
                      onChange={(v: BatchCheckKind) => patchCheck(check.key, { kind: v })}
                      options={BATCH_CHECK_KINDS.map((k) => ({
                        label: t(`conversation.batchJobs.checkKinds.${k}`),
                        value: k,
                      }))}
                    />
                    {check.kind === 'glob' ? (
                      <Input
                        size='small'
                        value={check.pattern}
                        placeholder={t(`${F}.checkPattern`)}
                        onChange={(v) => patchCheck(check.key, { pattern: v })}
                        data-testid={`batch-form-check-pattern-${index}`}
                      />
                    ) : (
                      <Input
                        size='small'
                        value={check.path}
                        placeholder={t(`${F}.checkPath`)}
                        onChange={(v) => patchCheck(check.key, { path: v })}
                        data-testid={`batch-form-check-path-${index}`}
                      />
                    )}
                    <Button
                      size='small'
                      type='text'
                      disabled={form.checks.length <= 1}
                      onClick={() => setForm((f) => ({ ...f, checks: f.checks.filter((c) => c.key !== check.key) }))}
                    >
                      {t(`${F}.removeCheck`)}
                    </Button>
                  </div>
                  {check.kind === 'glob' && (
                    <div className='flex items-center gap-8px text-12px text-t-secondary'>
                      <span>{t(`${F}.checkMin`)}</span>
                      <Input
                        size='mini'
                        className='w-80px'
                        value={check.min}
                        onChange={(v) => patchCheck(check.key, { min: v })}
                      />
                      <span>{t(`${F}.checkMax`)}</span>
                      <Input
                        size='mini'
                        className='w-80px'
                        value={check.max}
                        onChange={(v) => patchCheck(check.key, { max: v })}
                      />
                    </div>
                  )}
                  {check.kind === 'json_schema' && (
                    <Input.TextArea
                      value={check.schema}
                      autoSize={{ minRows: 3, maxRows: 10 }}
                      className='font-mono'
                      placeholder={t(`${F}.checkSchema`)}
                      onChange={(v) => patchCheck(check.key, { schema: v })}
                      data-testid={`batch-form-check-schema-${index}`}
                    />
                  )}
                  {issue && <div className='text-12px text-[rgb(var(--red-6))]'>{t(`${F}.checkIssues.${issue}`)}</div>}
                </div>
              );
            })}
            <Button
              size='small'
              className='self-start'
              disabled={form.checks.length >= BATCH_MAX_CHECKS}
              onClick={() => setForm((f) => ({ ...f, checks: [...f.checks, newCheckDraft('file_exists')] }))}
              data-testid='batch-form-add-check'
            >
              {t(`${F}.addCheck`)}
            </Button>
          </div>
        </div>
        <div className='grid grid-cols-3 gap-12px'>
          <div>
            {label(t(`${F}.concurrency`))}
            <InputNumber
              min={1}
              max={BATCH_MAX_CONCURRENCY}
              value={form.concurrency}
              onChange={(v) => patch({ concurrency: Number(v) || 1 })}
            />
          </div>
          <div>
            {label(t(`${F}.timeoutMinutes`))}
            <InputNumber
              min={BATCH_MIN_ITEM_TIMEOUT_SEC / 60}
              max={BATCH_MAX_ITEM_TIMEOUT_SEC / 60}
              value={form.timeoutMinutes}
              onChange={(v) => patch({ timeoutMinutes: Number(v) || 1 })}
            />
          </div>
          <div>
            {label(t(`${F}.trialSize`))}
            <InputNumber
              min={1}
              max={BATCH_MAX_TRIAL_SIZE}
              value={form.trialSize}
              onChange={(v) => patch({ trialSize: Number(v) || 1 })}
            />
          </div>
        </div>
        {hint(t(`${F}.trialHint`))}
        {submitted && built.issues.length > 0 && (
          <Alert
            type='warning'
            data-testid='batch-form-issues'
            content={
              <div className='flex flex-col gap-2px'>
                {built.issues.map((issue) => (
                  <span key={issue}>{t(`${F}.issues.${issue}`)}</span>
                ))}
              </div>
            }
          />
        )}
        {serverError && (
          <Alert
            type='error'
            title={t(serverError.key)}
            content={serverError.reason ?? undefined}
            data-testid='batch-form-server-error'
          />
        )}
      </div>
    </Drawer>
  );
};

export default BatchCreateDrawer;
