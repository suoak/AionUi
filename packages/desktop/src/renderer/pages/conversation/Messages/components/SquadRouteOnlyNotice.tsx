import type { SquadRouteOnlyRejection } from '@/common/chat/squadRouteOnly';
import { Alert, Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/** M8 E7-3: explains why a route_only Squad Leader's tool call was rejected. */
const SquadRouteOnlyNotice: React.FC<{ rejection: SquadRouteOnlyRejection }> = ({ rejection }) => {
  const { t } = useTranslation();
  return (
    <div className='mt-8px' data-testid='squad-route-only-notice'>
      <Alert
        type='warning'
        title={t('conversation.squadRouteOnly.title')}
        content={
          <div className='flex flex-col gap-6px'>
            <div>
              {rejection.tool
                ? t('conversation.squadRouteOnly.body', { tool: rejection.tool })
                : t('conversation.squadRouteOnly.bodyUnknownTool')}
            </div>
            <div className='flex flex-wrap items-center gap-4px'>
              <span className='text-t-secondary'>{t('conversation.squadRouteOnly.allowed')}</span>
              {rejection.allowed.map((tool) => (
                <Tag key={tool} size='small' data-testid='squad-route-only-allowed'>
                  {tool}
                </Tag>
              ))}
            </div>
            <div className='text-12px text-t-secondary'>{t('conversation.squadRouteOnly.hint')}</div>
          </div>
        }
      />
    </div>
  );
};

export default SquadRouteOnlyNotice;
