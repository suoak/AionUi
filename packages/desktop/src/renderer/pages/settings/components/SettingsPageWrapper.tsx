import classNames from 'classnames';
import React from 'react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import {
  SettingsTabNavigateProvider,
  SettingsViewModeProvider,
} from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
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
  Keyboard,
  Lightning,
  Protect,
  LinkCloud,
  Puzzle,
  Remind,
  Robot,
  Server,
  System,
  Toolkit,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { getVisibleBuiltinSettingsTabIds, LEGACY_ANCHOR_REMAP } from './SettingsSider';
import { arrangeSettingsNav } from './settingsNav';
import './settings.css';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

type NavItem = { label: string; icon: React.ReactElement; path: string; id: string };

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn): NavItem[] {
  const builtinMap: Record<string, NavItem> = {
    model: { id: 'model', label: t('settings.model'), icon: <LinkCloud theme='outline' size='16' />, path: 'model' },
    assistants: {
      id: 'assistants',
      label: t('settings.assistants', { defaultValue: 'Assistants' }),
      icon: <Robot theme='outline' size='16' />,
      path: 'assistants',
    },
    agent: {
      id: 'agent',
      label: t('settings.agents', { defaultValue: 'Agent runtimes' }),
      icon: <Robot theme='outline' size='16' />,
      path: 'agent',
    },
    skills: {
      id: 'skills',
      label: t('settings.skills', { defaultValue: 'Skill library' }),
      icon: <Lightning theme='outline' size='16' />,
      path: 'skills',
    },
    tools: {
      id: 'tools',
      label: t('settings.tools', { defaultValue: 'Tools' }),
      icon: <Toolkit theme='outline' size='16' />,
      path: 'tools',
    },
    appearance: {
      id: 'appearance',
      label: t('settings.appearancePanel'),
      icon: <Computer theme='outline' size='16' />,
      path: 'appearance',
    },
    webui: {
      id: 'webui',
      label: t('settings.webui'),
      icon: isDesktop ? <Earth theme='outline' size='16' /> : <Communication theme='outline' size='16' />,
      path: 'webui',
    },
    'remote-host': {
      id: 'remote-host',
      label: t('settings.remoteHost.navLabel'),
      icon: <Server theme='outline' size='16' />,
      path: 'remote-host',
    },
    devices: {
      id: 'devices',
      label: t('settings.devices.navLabel'),
      icon: <Iphone theme='outline' size='16' />,
      path: 'devices',
    },
    'local-kb': {
      id: 'local-kb',
      label: t('settings.localKb.navLabel'),
      icon: <BookOne theme='outline' size='16' />,
      path: 'local-kb',
    },
    extensions: {
      id: 'extensions',
      label: t('settings.extensionsPage.navLabel'),
      icon: <Puzzle theme='outline' size='16' />,
      path: 'extensions',
    },
    governance: {
      id: 'governance',
      label: t('settings.governance.navLabel'),
      icon: <Protect theme='outline' size='16' />,
      path: 'governance',
    },
    pet: { id: 'pet', label: t('pet.desktopPet'), icon: <Cat theme='outline' size='16' />, path: 'pet' },
    usage: {
      id: 'usage',
      label: t('settings.usage.title', { defaultValue: 'Usage' }),
      icon: <Analysis theme='outline' size='16' />,
      path: 'usage',
    },
    system: { id: 'system', label: t('settings.system'), icon: <System theme='outline' size='16' />, path: 'system' },
    notifications: {
      id: 'notifications',
      label: t('settings.notificationsPage.navLabel'),
      icon: <Remind theme='outline' size='16' />,
      path: 'notifications',
    },
    shortcuts: {
      id: 'shortcuts',
      label: t('settings.shortcutsPage.navLabel'),
      icon: <Keyboard theme='outline' size='16' />,
      path: 'shortcuts',
    },
    archived: {
      id: 'archived',
      label: t('settings.archived.navLabel'),
      icon: <Inbox theme='outline' size='16' />,
      path: 'archived',
    },
    about: { id: 'about', label: t('settings.about'), icon: <Info theme='outline' size='16' />, path: 'about' },
  };

  return getVisibleBuiltinSettingsTabIds(isDesktop).map((id) => builtinMap[id]);
}

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();

  const extensionTabs = useExtensionSettingsTabs();

  const { resolveExtTabName } = useExtI18n();

  const menuItems = React.useMemo(() => {
    const builtins = getBuiltinSettingsNavItems(isDesktop, t);

    const toNavItem = (tab: IExtensionSettingsTab): NavItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      return {
        id: tab.id,
        label: resolveExtTabName(tab),
        icon: resolvedIcon ? (
          <img src={resolvedIcon} alt='' className='w-16px h-16px object-contain' />
        ) : (
          <Puzzle theme='outline' size='16' />
        ),
        path: `ext/${tab.id}`,
      };
    };

    // 3.0 V7: same grouped order as the desktop sider.
    const result = arrangeSettingsNav(builtins, extensionTabs, toNavItem, LEGACY_ANCHOR_REMAP).map(({ item }) => item);

    return result;
  }, [isDesktop, t, extensionTabs, resolveExtTabName]);

  // Keep only horizontal padding on the scroll container — vertical padding is
  // moved to the content layer below. A sticky header inside a scroll container
  // with top padding would otherwise stick 32px down, letting content peek
  // through the gap above it.
  const containerClass = classNames(
    'settings-page-wrapper w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px' : 'px-12px md:px-40px',
    className
  );

  const contentClass = classNames(
    'settings-page-content mx-auto w-full md:max-w-1024px py-14px md:py-32px',
    contentClassName
  );

  const navigateToTab = React.useCallback(
    (tabId: string) => {
      void navigate(`/settings/${tabId}`, { replace: true });
    },
    [navigate]
  );

  return (
    <SettingsViewModeProvider value='page'>
      <SettingsTabNavigateProvider value={navigateToTab}>
        <div className={containerClass}>
          {isMobile && (
            <div className='settings-mobile-top-nav'>
              {menuItems.map((item) => {
                const active = pathname.includes(`/settings/${item.path}`);
                return (
                  <button
                    key={item.path}
                    type='button'
                    className={classNames('settings-mobile-top-nav__item', {
                      'settings-mobile-top-nav__item--active': active,
                    })}
                    onClick={() => {
                      void navigate(`/settings/${item.path}`, { replace: true });
                    }}
                  >
                    <span className='settings-mobile-top-nav__icon'>{item.icon}</span>
                    <span className='settings-mobile-top-nav__label'>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className={contentClass}>{children}</div>
        </div>
      </SettingsTabNavigateProvider>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
