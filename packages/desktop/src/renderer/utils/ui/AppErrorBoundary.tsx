/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[AppErrorBoundary] Uncaught renderer error', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <AppErrorFallback />;
    }
    return this.props.children;
  }
}

const AppErrorFallback: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='flex min-h-screen items-center justify-center bg-bg-1 px-24px' data-testid='app-error-boundary'>
      <div className='max-w-480px text-center'>
        <Typography.Title heading={4} className='!mb-8px text-t-primary'>
          {t('common.appCrash.title', { defaultValue: 'Something went wrong' })}
        </Typography.Title>
        <Typography.Paragraph className='mb-16px text-t-secondary'>
          {t('common.appCrash.description', {
            defaultValue:
              'The page hit an unexpected error. Your conversation history is still saved. Reload to continue.',
          })}
        </Typography.Paragraph>
        <Button type='primary' onClick={() => window.location.reload()}>
          {t('common.appCrash.reload', { defaultValue: 'Reload' })}
        </Button>
      </div>
    </div>
  );
};

export default AppErrorBoundary;
