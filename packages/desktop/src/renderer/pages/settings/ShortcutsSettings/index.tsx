/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** 3.0 V7: read-only keyboard shortcuts reference. */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tag } from '@arco-design/web-react';
import KeyHint from '@/renderer/components/design/KeyHint';
import { isElectronDesktop } from '@/renderer/utils/platform';
import SettingsPageHeader from '../components/SettingsPageHeader';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { SHORTCUT_SECTIONS, SHORTCUTS } from './shortcuts';

export const ShortcutsSettingsContent: React.FC = () => {
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  return (
    <div className='flex flex-col gap-16px' data-testid='shortcuts-settings'>
      <SettingsPageHeader
        title={t('settings.shortcutsPage.title')}
        description={t('settings.shortcutsPage.description')}
      />
      {SHORTCUT_SECTIONS.map((section) => {
        const entries = SHORTCUTS.filter((entry) => entry.section === section);
        return (
          <section key={section} className='flex flex-col gap-6px' data-testid={`shortcuts-section-${section}`}>
            <h2 className='m-0 text-13px font-[600] text-t-secondary'>
              {t(`settings.shortcutsPage.sections.${section}`)}
            </h2>
            <div className='rounded-12px border border-solid border-border-2 bg-2 divide-y divide-border-2'>
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className='flex items-center justify-between gap-12px px-16px py-10px'
                  data-testid='shortcut-row'
                  data-shortcut={entry.id}
                >
                  <div className='min-w-0 flex items-center gap-8px text-13px text-t-primary'>
                    <span>{t(`settings.shortcutsPage.actions.${entry.id}`)}</span>
                    {entry.desktopOnly && !isDesktop ? (
                      <Tag size='small' data-testid='shortcut-desktop-only'>
                        {t('settings.shortcutsPage.desktopOnly')}
                      </Tag>
                    ) : null}
                  </div>
                  <div className='flex items-center gap-6px shrink-0'>
                    {entry.chords.map((chord, index) => (
                      <React.Fragment key={chord.join('+')}>
                        {index > 0 ? (
                          <span className='text-11px text-t-tertiary'>{t('settings.shortcutsPage.or')}</span>
                        ) : null}
                        <KeyHint keys={chord} />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <div className='text-12px text-t-tertiary'>{t('settings.shortcutsPage.readOnlyNote')}</div>
    </div>
  );
};

const ShortcutsSettings: React.FC = () => (
  <SettingsPageWrapper>
    <ShortcutsSettingsContent />
  </SettingsPageWrapper>
);

export default ShortcutsSettings;
