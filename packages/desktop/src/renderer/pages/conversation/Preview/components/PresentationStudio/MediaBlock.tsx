import { ipcBridge } from '@/common';
import type { ChatFileRef } from '@/common/types/chatFile';
import type { DeckAsset } from '@/common/types/office/presentation';
import React, { useEffect, useState } from 'react';
import { resolveAssetFileRef } from './deckState';

type Props = {
  asset?: DeckAsset;
  deckRef?: ChatFileRef;
  deckPath?: string;
  fallback: string;
};

const MediaBlock: React.FC<Props> = ({ asset, deckRef, deckPath, fallback }) => {
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

  return source ? (
    <img className='block h-full w-full object-cover' src={source} alt={asset?.alt ?? fallback} />
  ) : (
    <span>{fallback}</span>
  );
};

export default MediaBlock;
