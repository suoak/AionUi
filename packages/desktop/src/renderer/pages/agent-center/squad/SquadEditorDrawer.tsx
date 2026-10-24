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
  SQUAD_DESCRIPTION_MAX,
  SQUAD_MAX_MEMBERS,
  SQUAD_MAX_PARALLEL,
  SQUAD_NAME_MAX,
  SQUAD_ROLE_DESCRIPTION_MAX,
  SQUAD_ROLE_TITLE_MAX,
  type SquadLeaderMode,
  type SquadTemplate,
  type SquadTemplateInput,
} from '@/common/types/agent/squad';
import {
  isSquadStale,
  missingSquadRefs,
  squadErrorKey,
  squadIneligibleAssistantId,
  squadIssueKey,
  squadToInput,
  validateSquadInput,
} from './squadModel';

type SquadEditorDrawerProps = {
  visible: boolean;
  /** null = create a new template. */
  squad: SquadTemplate | null;
  assistants: Assistant[];
  onClose: () => void;
  onSaved: (squad: SquadTemplate) => void;
  /** Optimistic-lock conflict: the list refetches and the editor closes. */
  onStale: () => void;
};

const emptyDraft = (): SquadTemplateInput => ({
  name: '',
  description: '',
  leader_assistant_id: '',
  leader_mode: 'route_only',
  members: [],
});

const newMember = () => ({ assistant_id: '', role_title: '', role_description: '', max_parallel: 1 });

/** Create / edit a Squad template: Leader + up to 5 members (6 incl. Leader). */
const SquadEditorDrawer: React.FC<SquadEditorDrawerProps> = ({
  visible,
  squad,
  assistants,
  onClose,
  onSaved,
  onStale,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SquadTemplateInput>(emptyDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setDraft(squad ? squadToInput(squad) : emptyDraft());
  }, [visible, squad]);

  // Selectable = backend Team catalog (team_selectable); keep already-referenced ids visible.
  const options = useMemo(() => {
    const referenced = new Set([draft.leader_assistant_id, ...draft.members.map((m) => m.assistant_id)]);
    const list = assistants.filter((a) => a.team_selectable || referenced.has(a.id));
    const known = new Set(list.map((a) => a.id));
    const briefs = squad ? [squad.leader, ...squad.member_assistants] : [];
    for (const b of briefs) {
      if (b && referenced.has(b.id) && !known.has(b.id)) {
        known.add(b.id);
        list.push({ id: b.id, name: b.name } as Assistant);
      }
    }
    return list;
  }, [assistants, draft.leader_assistant_id, draft.members, squad]);

  const nameOf = (id: string) => options.find((a) => a.id === id)?.name ?? id;
  const missing = squad ? missingSquadRefs(squad) : [];

  const setMember = (index: number, patch: Partial<SquadTemplateInput['members'][number]>) =>
    setDraft((d) => ({ ...d, members: d.members.map((m, i) => (i === index ? { ...m, ...patch } : m)) }));

  const save = async () => {
    const input: SquadTemplateInput = {
      ...draft,
      name: draft.name.trim(),
      members: draft.members.map((m) => ({ ...m, role_title: m.role_title.trim() })),
    };
    const issue = validateSquadInput(input);
    if (issue) {
      Message.error(t(squadIssueKey(issue)));
      return;
    }
    setSaving(true);
    try {
      const saved = squad
        ? await ipcBridge.squads.update.invoke({
            id: squad.id,
            updates: { ...input, expected_updated_at: squad.updated_at },
          })
        : await ipcBridge.squads.create.invoke(input);
      Message.success(t(squad ? 'agent.agentCenter.squad.saved' : 'agent.agentCenter.squad.created'));
      onSaved(saved);
    } catch (error) {
      console.error('[Squad] Save failed:', error);
      if (isSquadStale(error)) {
        Message.warning(t('agent.agentCenter.squad.errors.squad_stale'));
        onStale();
        return;
      }
      const ineligible = squadIneligibleAssistantId(error);
      Message.error(
        ineligible
          ? t('agent.agentCenter.squad.ineligibleNamed', { name: nameOf(ineligible) })
          : t(squadErrorKey(error))
      );
    } finally {
      setSaving(false);
    }
  };

  const assistantSelect = (value: string, onChange: (id: string) => void, testId: string) => (
    <Select
      size='small'
      showSearch
      filterOption={(input, option) =>
        String((option as { props?: { children?: unknown } })?.props?.children ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      value={value || undefined}
      onChange={onChange}
      placeholder={t('agent.agentCenter.squad.fields.assistant')}
      data-testid={testId}
    >
      {options.map((a) => (
        <Select.Option key={a.id} value={a.id}>
          {a.name}
        </Select.Option>
      ))}
    </Select>
  );

  return (
    <Drawer
      width={560}
      visible={visible}
      title={t(squad ? 'agent.agentCenter.squad.edit' : 'agent.agentCenter.squad.create')}
      onCancel={onClose}
      unmountOnExit
      footer={
        <div className='flex justify-end gap-8px'>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type='primary' loading={saving} onClick={() => void save()} data-testid='squad-editor-save'>
            {t('agent.agentCenter.squad.save')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-14px' data-testid='squad-editor'>
        {missing.length > 0 ? (
          <Alert type='warning' content={t('agent.agentCenter.squad.missingRefs', { count: missing.length })} />
        ) : null}
        <label className='flex flex-col gap-4px'>
          <span className='text-13px font-medium'>{t('agent.agentCenter.squad.fields.name')}</span>
          <Input
            value={draft.name}
            maxLength={SQUAD_NAME_MAX}
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
            data-testid='squad-editor-name'
          />
        </label>
        <label className='flex flex-col gap-4px'>
          <span className='text-13px font-medium'>{t('agent.agentCenter.squad.fields.description')}</span>
          <Input.TextArea
            value={draft.description ?? ''}
            maxLength={SQUAD_DESCRIPTION_MAX}
            autoSize={{ minRows: 2, maxRows: 5 }}
            onChange={(description) => setDraft((d) => ({ ...d, description }))}
          />
        </label>
        <div className='flex flex-col gap-4px'>
          <span className='text-13px font-medium'>{t('agent.agentCenter.squad.fields.leader')}</span>
          {assistantSelect(
            draft.leader_assistant_id,
            (id) => setDraft((d) => ({ ...d, leader_assistant_id: id })),
            'squad-editor-leader'
          )}
          <Radio.Group
            size='small'
            value={draft.leader_mode ?? 'route_only'}
            onChange={(mode: SquadLeaderMode) => setDraft((d) => ({ ...d, leader_mode: mode }))}
          >
            <Radio value='route_only'>{t('agent.agentCenter.squad.leaderMode.route_only')}</Radio>
            <Radio value='route_and_work'>{t('agent.agentCenter.squad.leaderMode.route_and_work')}</Radio>
          </Radio.Group>
          <span className='text-12px text-t-secondary'>
            {t(`agent.agentCenter.squad.leaderModeHint.${draft.leader_mode ?? 'route_only'}`)}
          </span>
        </div>
        <div className='flex flex-col gap-8px'>
          <div className='flex items-center justify-between'>
            <span className='text-13px font-medium'>
              {t('agent.agentCenter.squad.fields.members')} ({draft.members.length}/{SQUAD_MAX_MEMBERS})
            </span>
            <Button
              size='mini'
              disabled={draft.members.length >= SQUAD_MAX_MEMBERS}
              onClick={() => setDraft((d) => ({ ...d, members: [...d.members, newMember()] }))}
              data-testid='squad-editor-add-member'
            >
              {t('agent.agentCenter.squad.addMember')}
            </Button>
          </div>
          <span className='text-12px text-t-secondary'>
            {t('agent.agentCenter.squad.membersHint', { limit: SQUAD_MAX_MEMBERS })}
          </span>
          {draft.members.map((m, index) => (
            <div
              key={index}
              className='flex flex-col gap-6px rounded-8px border border-[var(--color-border-2)] p-10px'
              data-testid='squad-editor-member'
            >
              <div className='flex items-center gap-6px'>
                <div className='flex-1 min-w-0'>
                  {assistantSelect(
                    m.assistant_id,
                    (id) => setMember(index, { assistant_id: id }),
                    'squad-member-assistant'
                  )}
                </div>
                <Button
                  size='mini'
                  status='danger'
                  onClick={() => setDraft((d) => ({ ...d, members: d.members.filter((_, i) => i !== index) }))}
                >
                  {t('agent.agentCenter.squad.removeMember')}
                </Button>
              </div>
              <Input
                size='small'
                value={m.role_title}
                maxLength={SQUAD_ROLE_TITLE_MAX}
                placeholder={t('agent.agentCenter.squad.fields.roleTitle')}
                onChange={(role_title) => setMember(index, { role_title })}
                data-testid='squad-member-role'
              />
              <Input.TextArea
                value={m.role_description ?? ''}
                maxLength={SQUAD_ROLE_DESCRIPTION_MAX}
                autoSize={{ minRows: 1, maxRows: 4 }}
                placeholder={t('agent.agentCenter.squad.fields.roleDescription')}
                onChange={(role_description) => setMember(index, { role_description })}
              />
              <div className='flex items-center gap-6px text-12px text-t-secondary'>
                {t('agent.agentCenter.squad.fields.maxParallel')}
                <InputNumber
                  size='mini'
                  className='w-80px'
                  min={1}
                  max={SQUAD_MAX_PARALLEL}
                  precision={0}
                  value={m.max_parallel ?? 1}
                  onChange={(v) => setMember(index, { max_parallel: Number(v) || 1 })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
};

export default SquadEditorDrawer;
