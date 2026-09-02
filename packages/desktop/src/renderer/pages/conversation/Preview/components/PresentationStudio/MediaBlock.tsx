import { ipcBridge } from '@/common';
import type { ChatFileRef } from '@/common/types/chatFile';
import type { DeckAsset } from '@/common/types/office/presentation';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveAssetFileRef } from './deckState';

type Props = {
  asset?: DeckAsset;
  deckRef?: ChatFileRef;
  deckPath?: string;
  fallback: string;
};

const MediaBlock: React.FC<Props> = ({ asset, deckRef, deckPath, fallback }) => {
  const { t } = useTranslation();
  const [source, setSource] = useState<string>();

  useEffect(() => {
    const ref = asset?.status === 'ready' ? resolveAssetFileRef(deckRef, deckPath, asset.path) : null;
    if (!ref) {
      setSource(undefined);
      return;
    }
    let active = true;
    void ipcBridge.fs.readContent
      .invoke({ file: ref, encoding: 'dataurl' })
      .then((value) => active && setSource(value))
      .catch(() => active && setSource(undefined));
    return () => {
      active = false;
    };
  }, [asset?.path, asset?.status, deckPath, deckRef]);

  if (source) {
    return <img className='block h-full w-full object-cover' src={source} alt={asset?.alt ?? fallback} />;
  }

  if (asset?.status === 'pending') {
    return (
      <span
        className='flex h-full w-full flex-col items-start justify-center gap-4px bg-primary-light px-10px text-left text-12px text-t-secondary'
        data-testid='media-pending'
      >
        <span className='font-500 text-t-primary'>{t('presentation.media.pendingPlaceholder')}</span>
        <span className='text-11px text-t-tertiary'>{t('presentation.media.pendingHint')}</span>
      </span>
    );
  }

  if (asset?.status === 'error') {
    return (
      <span
        className='flex h-full w-full flex-col items-start justify-center gap-4px bg-danger-light-1 px-10px text-left text-12px text-danger-6'
        data-testid='media-error'
      >
        <span className='font-500'>{t('presentation.media.errorPlaceholder')}</span>
        <span className='text-11px opacity-80'>{t('presentation.media.errorHint')}</span>
      </span>
    );
  }

  return <span>{fallback}</span>;
};

export default MediaBlock;
