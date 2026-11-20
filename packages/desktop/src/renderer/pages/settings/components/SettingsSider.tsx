import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import {
  Analysis,
  BookOne,
  Cat,
  Communication,
  Computer,
  Earth,
  Inbox,
  Info,
  Iphone,
  Lightning,
  Protect,
  LinkCloud,
  Puzzle,
  Search,
  Speed,
  System,
  Toolkit,
} from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input, Tooltip } from '@arco-design/web-react';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';
import { DESKTOP_PET_FEATURE_ENABLED } from '@/common/config/constants';
import { arrangeSettingsNav, filterSettingsNav, SETTINGS_GROUPS, type SettingsGroupId } from './settingsNav';

/**
 * Builtin settings tab IDs in display order (must match router paths).
 * 3.0 V7: ordered by the six settings groups (see `settingsNav.ts`).
 */
export const BUILTIN_TAB_IDS = [
  'appearance',
  'system',
  'pet',
  'model',
  'agent',
  'tools',
  'skills',
  'webui',
  'devices',
  'local-kb',
  'governance',
  'usage',
  'archived',
  'about',
] as const;

export const getVisibleBuiltinSettingsTabIds = (isDesktop: boolean): (typeof BUILTIN_TAB_IDS)[number][] =>
  BUILTIN_TAB_IDS.filter((id) => id !== 'pet' || (DESKTOP_PET_FEATURE_ENABLED && isDesktop));

/**
 * Legacy anchor IDs that have been merged into other tabs.
 * When an extension anchors to one of these, it is redirected to the new host.
 * This keeps older extensions working without requiring them to update.
 */
export const LEGACY_ANCHOR_REMAP: Record<string, string> = {
  'skills-hub': 'skills',
  capabilities: 'skills',
  display: 'appearance',
};

type SiderItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  /** Route path segment — for builtins: `/settings/{path}`, for extensions: `/settings/ext/{id}` */
  path: string;
};

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = isElectronDesktop();

  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  const [query, setQuery] = useState('');
  const { arranged } = useMemo(() => {
    // Build builtin items
    const builtinMap: Record<string, SiderItem> = {
      model: { id: 'model', label: t('settings.model'), icon: <LinkCloud />, path: 'model' },
      agent: {
        id: 'agent',
        label: t('settings.agents', { defaultValue: 'Agents' }),
        icon: <Speed />,
        path: 'agent',
      },
      skills: {
        id: 'skills',
        label: t('settings.skills', { defaultValue: 'Skills' }),
        icon: <Lightning />,
        path: 'skills',
      },
      tools: {
        id: 'tools',
        label: t('settings.tools', { defaultValue: 'Tools' }),
        icon: <Toolkit />,
        path: 'tools',
      },
      appearance: { id: 'appearance', label: t('settings.appearancePanel'), icon: <Computer />, path: 'appearance' },
      webui: {
        id: 'webui',
        label: t('settings.webui'),
        icon: isDesktop ? <Earth /> : <Communication />,
        path: 'webui',
      },
      devices: { id: 'devices', label: t('settings.devices.navLabel'), icon: <Iphone />, path: 'devices' },
      'local-kb': {
        id: 'local-kb',
        label: t('settings.localKb.navLabel'),
        icon: <BookOne />,
        path: 'local-kb',
      },
      governance: {
        id: 'governance',
        label: t('settings.governance.navLabel'),
        icon: <Protect />,
        path: 'governance',
      },
      pet: { id: 'pet', label: t('pet.desktopPet'), icon: <Cat />, path: 'pet' },
      usage: {
        id: 'usage',
        label: t('settings.usage.title', { defaultValue: 'Usage' }),
        icon: <Analysis />,
        path: 'usage',
      },
      system: { id: 'system', label: t('settings.system'), icon: <System />, path: 'system' },
      archived: {
        id: 'archived',
        label: t('settings.archived.navLabel'),
        icon: <Inbox />,
        path: 'archived',
      },
      about: { id: 'about', label: t('settings.about'), icon: <Info />, path: 'about' },
    };

    const builtins: SiderItem[] = getVisibleBuiltinSettingsTabIds(isDesktop).map((id) => builtinMap[id]);

    const toSiderItem = (tab: IExtensionSettingsTab): SiderItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      return {
        id: tab.id,
        label: resolveExtTabName(tab),
        icon: resolvedIcon ? <img src={resolvedIcon} alt='' className='w-full h-full object-contain' /> : <Puzzle />,
        isImageIcon: Boolean(resolvedIcon),
        path: `ext/${tab.id}`,
      };
    };

    return { arranged: arrangeSettingsNav(builtins, extensionTabs, toSiderItem, LEGACY_ANCHOR_REMAP) };
  }, [t, isDesktop, extensionTabs, resolveExtTabName]);

  const groupLabel = useCallback(
    (group: SettingsGroupId) => t(SETTINGS_GROUPS.find((g) => g.id === group)!.labelKey),
    [t]
  );
  const searching = !collapsed && query.trim().length > 0;
  const visible = useMemo(
    () => (searching ? filterSettingsNav(arranged, query, groupLabel) : arranged),
    [arranged, groupLabel, query, searching]
  );

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  return (
    <div
      className={classNames('h-full settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {!collapsed && (
        <div className='settings-sider__search px-4px pb-4px shrink-0'>
          <Input
            allowClear
            size='small'
            value={query}
            onChange={setQuery}
            prefix={<Search theme='outline' size='14' />}
            placeholder={t('settings.groups.searchPlaceholder')}
            aria-label={t('settings.groups.searchPlaceholder')}
            data-testid='settings-search'
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('');
              if (event.key === 'Enter' && visible.length > 0) {
                Promise.resolve(navigate(`/settings/${visible[0].item.path}`, { replace: true })).catch((error) => {
                  console.error('Navigation failed:', error);
                });
              }
            }}
          />
        </div>
      )}
      {searching && visible.length === 0 && (
        <div className='px-12px py-8px text-13px text-t-secondary' data-testid='settings-search-empty' role='status'>
          {t('settings.groups.searchEmpty')}
        </div>
      )}
      {visible.map(({ item, group }, index) => {
        const isSelected = pathname.includes(item.path);
        const showHeader = !collapsed && (index === 0 || visible[index - 1].group !== group);
        const groupHeader = showHeader ? (
          <div
            className='settings-sider__group-header px-12px mt-8px h-28px flex items-center text-14px font-[500] text-t-tertiary select-none'
            data-settings-group={group}
            role='heading'
            aria-level={2}
          >
            {groupLabel(group)}
          </div>
        ) : null;
        return (
          <React.Fragment key={item.id}>
            {groupHeader}
            <Tooltip {...siderTooltipProps} content={item.label} position='right'>
              <div
                data-settings-id={item.id}
                data-settings-path={item.path}
                className={classNames(
                  'settings-sider__item h-34px rd-8px flex items-center gap-8px group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px transition-colors',
                  collapsed ? 'w-full justify-center px-0' : 'justify-start px-10px',
                  {
                    'hover:bg-fill-3': !isSelected,
                    '!bg-fill-3': isSelected,
                  }
                )}
                onClick={() => {
                  Promise.resolve(navigate(`/settings/${item.path}`, { replace: true })).catch((error) => {
                    console.error('Navigation failed:', error);
                  });
                }}
              >
                {/* Leading icon — 22px slot to align with main sider rows */}
                <span className='size-22px flex items-center justify-center shrink-0 line-height-0'>
                  {item.isImageIcon ? (
                    <span className='w-16px h-16px flex items-center justify-center'>{item.icon}</span>
                  ) : (
                    React.cloneElement(
                      item.icon as React.ReactElement<{
                        theme?: string;
                        size?: string | number;
                        className?: string;
                        strokeWidth?: number;
                      }>,
                      {
                        theme: 'outline',
                        size: '16',
                        strokeWidth: 3,
                        className: 'block leading-none text-t-secondary',
                      }
                    )
                  )}
                </span>
                <FlexFullContainer className='h-24px collapsed-hidden'>
                  <div className='settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px font-[500] lh-24px whitespace-nowrap text-t-primary'>
                    {item.label}
                  </div>
                </FlexFullContainer>
              </div>
            </Tooltip>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SettingsSider;
