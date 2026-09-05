import { Select, Tooltip } from '@arco-design/web-react';
import { DROPDOWN_SEARCH_THRESHOLD } from '@renderer/components/agent/runtimeSelectorOptions';
import React from 'react';

const AUTO_SELECT_VALUE = '__AUTO__';

export type CapabilitySelectOption = {
  key?: string;
  value: string;
  label: string;
  description?: string;
};

type ScalarMode = 'auto' | 'fixed';

type CapabilityDefaultsFieldsProps = {
  localeKey: string;
  modelMode: ScalarMode;
  setModelMode: (mode: ScalarMode) => void;
  modelValue: string;
  setModelValue: (value: string) => void;
  modelOptions: CapabilitySelectOption[];
  permissionMode: ScalarMode;
  setPermissionMode: (mode: ScalarMode) => void;
  permissionValue: string;
  setPermissionValue: (value: string) => void;
  permissionOptions: CapabilitySelectOption[];
  showThoughtLevel: boolean;
  thoughtLevelMode: ScalarMode;
  setThoughtLevelMode: (mode: ScalarMode) => void;
  thoughtLevelValue: string;
  setThoughtLevelValue: (value: string) => void;
  thoughtLevelOptions: CapabilitySelectOption[];
  autoLabel?: string;
};

const filterSelectOption = (inputValue: string, option: React.ReactElement): boolean => {
  const props = option.props as { value?: string; 'data-label'?: string };
  if (props.value === AUTO_SELECT_VALUE) return true;
  const label = props['data-label'] ?? String(props.value ?? '');
  return label.toLowerCase().includes(inputValue.trim().toLowerCase());
};

/**
 * ChatGPT-like model / permission / thought defaults for Agent Center 能力配置.
 * Mirrors Assistants DefaultsSection semantics (auto = remember last used) but
 * uses WorkMate wizard voice; persists via assistant.defaults.
 */
const CapabilityDefaultsFields: React.FC<CapabilityDefaultsFieldsProps> = ({
  localeKey,
  modelMode,
  setModelMode,
  modelValue,
  setModelValue,
  modelOptions,
  permissionMode,
  setPermissionMode,
  permissionValue,
  setPermissionValue,
  permissionOptions,
  showThoughtLevel,
  thoughtLevelMode,
  setThoughtLevelMode,
  thoughtLevelValue,
  setThoughtLevelValue,
  thoughtLevelOptions,
  autoLabel = '自动（记住上次使用）',
}) => {
  const hasFixedThought =
    thoughtLevelMode === 'fixed' &&
    Boolean(thoughtLevelValue) &&
    thoughtLevelOptions.some((option) => option.value === thoughtLevelValue);

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex flex-col gap-8px'>
        <span className='font-medium'>默认模型</span>
        <span className='text-12px text-[var(--color-text-3)]'>
          与设置 → 助手同源：aionrs 从 Providers（/api/providers）选模型；其他引擎用其可用模型列表。仅影响新会话。
        </span>
        <Select
          key={`agent-center-default-model-${localeKey}`}
          value={modelMode === 'fixed' && modelValue ? modelValue : AUTO_SELECT_VALUE}
          onChange={(value) => {
            const next = value as string;
            if (next === AUTO_SELECT_VALUE) {
              setModelMode('auto');
              setModelValue('');
              return;
            }
            setModelMode('fixed');
            setModelValue(next);
          }}
          showSearch={modelOptions.length > DROPDOWN_SEARCH_THRESHOLD}
          filterOption={filterSelectOption}
          placeholder='选择默认模型'
          notFoundContent='暂无可用模型，请先在设置中配置 Providers'
          data-testid='agent-center-default-model'
        >
          <Select.Option value={AUTO_SELECT_VALUE}>{autoLabel}</Select.Option>
          {modelOptions.map((option) => (
            <Select.Option
              key={`${localeKey}-${option.key ?? option.value}`}
              value={option.value}
              data-label={option.label}
            >
              {option.description ? (
                <Tooltip content={option.description} position='right'>
                  <span className='block min-w-0 truncate'>{option.label}</span>
                </Tooltip>
              ) : (
                <span className='block min-w-0 truncate'>{option.label}</span>
              )}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div className='flex flex-col gap-8px'>
        <span className='font-medium'>默认权限模式</span>
        <span className='text-12px text-[var(--color-text-3)]'>
          对应助手 Defaults 的 Permission；选项来自当前后端 Agent。
        </span>
        <Select
          key={`agent-center-default-permission-${localeKey}-${permissionMode}`}
          value={permissionMode === 'fixed' && permissionValue ? permissionValue : AUTO_SELECT_VALUE}
          onChange={(value) => {
            const next = value as string;
            if (next === AUTO_SELECT_VALUE) {
              setPermissionMode('auto');
              setPermissionValue('');
              return;
            }
            setPermissionMode('fixed');
            setPermissionValue(next);
          }}
          placeholder='选择权限模式'
          notFoundContent='当前引擎无可切换权限模式'
          data-testid='agent-center-default-permission'
        >
          <Select.Option value={AUTO_SELECT_VALUE}>{autoLabel}</Select.Option>
          {permissionOptions.map((option) => (
            <Select.Option key={`${localeKey}-${option.value}`} value={option.value} data-label={option.label}>
              {option.description ? (
                <Tooltip content={option.description} position='right'>
                  <span className='block min-w-0 truncate'>{option.label}</span>
                </Tooltip>
              ) : (
                <span className='block min-w-0 truncate'>{option.label}</span>
              )}
            </Select.Option>
          ))}
        </Select>
      </div>

      {showThoughtLevel ? (
        <div className='flex flex-col gap-8px'>
          <span className='font-medium'>默认思考强度</span>
          <span className='text-12px text-[var(--color-text-3)]'>
            引擎支持时显示（Thought Level / reasoning effort）。
          </span>
          <Select
            key={`agent-center-default-thought-${localeKey}-${thoughtLevelMode}`}
            value={hasFixedThought ? thoughtLevelValue : AUTO_SELECT_VALUE}
            onChange={(value) => {
              const next = value as string;
              if (next === AUTO_SELECT_VALUE) {
                setThoughtLevelMode('auto');
                setThoughtLevelValue('');
                return;
              }
              setThoughtLevelMode('fixed');
              setThoughtLevelValue(next);
            }}
            placeholder='选择思考强度'
            data-testid='agent-center-default-thought-level'
          >
            <Select.Option value={AUTO_SELECT_VALUE}>{autoLabel}</Select.Option>
            {thoughtLevelOptions.map((option) => (
              <Select.Option key={`${localeKey}-${option.value}`} value={option.value} data-label={option.label}>
                {option.description ? (
                  <Tooltip content={option.description} position='right'>
                    <span className='block min-w-0 truncate'>{option.label}</span>
                  </Tooltip>
                ) : (
                  <span className='block min-w-0 truncate'>{option.label}</span>
                )}
              </Select.Option>
            ))}
          </Select>
        </div>
      ) : null}
    </div>
  );
};

export default CapabilityDefaultsFields;
