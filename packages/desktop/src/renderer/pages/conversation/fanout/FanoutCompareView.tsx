/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { FanoutGroup } from '@/common/types/fanout';
import { Empty, Spin, Tag, Typography } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import FanoutFileDiff from './FanoutFileDiff';
import { compareTotals } from './fanoutModel';

type FanoutCompareViewProps = {
  group: FanoutGroup;
  assistantName: (id: string) => string;
};

const CELL_COLOR: Record<string, string> = {
  added: 'rgb(var(--success-6))',
  deleted: 'rgb(var(--danger-6))',
  untracked: 'rgb(var(--success-6))',
};

/**
 * Side-by-side result of every slot (design E3 §2.3): per-slot totals and last
 * reply, and a file × slot matrix of what each slot changed. Clicking a cell
 * opens that slot's diff of the file.
 */
const FanoutCompareView: React.FC<FanoutCompareViewProps> = ({ group, assistantName }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{ slot: string; path: string } | null>(null);
  const { data, isLoading, error } = useSWR(
    ['fanout.compare', group.id, group.updated_at],
    ([, id]: [string, string, number]) => ipcBridge.fanout.compare.invoke({ id }),
    { revalidateOnFocus: false, keepPreviousData: true }
  );

  if (isLoading && !data) return <Spin className='m-16px' />;
  if (error || !data) return <Empty description={t('conversation.fanout.compareUnavailable')} />;

  const totals = compareTotals(data);
  const labels = data.slots.map((slot) => slot.slot);
  const selectedWorktree = selected ? data.slots.find((slot) => slot.slot === selected.slot)?.worktree?.id : undefined;

  return (
    <div className='flex flex-col gap-12px' data-testid='fanout-compare'>
      <div
        className='grid gap-8px'
        style={{ gridTemplateColumns: `repeat(${Math.max(labels.length, 1)}, minmax(0, 1fr))` }}
      >
        {data.slots.map((slot) => (
          <div key={slot.slot} className='rd-8px b-1 b-solid b-[var(--color-border-2)] p-10px'>
            <div className='mb-4px flex items-center gap-6px text-13px font-medium text-t-primary'>
              <span>{slot.slot}</span>
              <span className='truncate text-t-secondary'>{assistantName(slot.assistant_id)}</span>
            </div>
            <div className='mb-6px text-12px text-t-secondary'>
              {t('conversation.fanout.totals', {
                files: totals[slot.slot]?.files ?? 0,
                additions: totals[slot.slot]?.additions ?? 0,
                deletions: totals[slot.slot]?.deletions ?? 0,
              })}
            </div>
            <Typography.Paragraph
              className='!mb-0 !text-12px !text-t-tertiary'
              ellipsis={{ rows: 4, expandable: true }}
            >
              {slot.summary || t('conversation.fanout.noSummary')}
            </Typography.Paragraph>
          </div>
        ))}
      </div>

      {data.files.length === 0 ? (
        <Empty description={t('conversation.fanout.noChanges')} />
      ) : (
        <div className='overflow-auto'>
          <table className='w-full border-collapse text-12px' data-testid='fanout-file-matrix'>
            <thead>
              <tr className='text-t-secondary'>
                <th className='px-8px py-4px text-start font-normal'>{t('conversation.fanout.file')}</th>
                {labels.map((label) => (
                  <th key={label} className='px-8px py-4px text-center font-normal'>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.files.map((row) => (
                <tr key={row.path} className='b-t-1 b-t-solid b-[var(--color-border-1)]'>
                  <td className='max-w-360px truncate px-8px py-4px font-mono text-t-primary' title={row.path}>
                    {row.path}
                  </td>
                  {labels.map((label) => {
                    const cell = row.slots[label];
                    return (
                      <td key={label} className='px-8px py-4px text-center'>
                        {cell ? (
                          <Tag
                            size='small'
                            className='cursor-pointer'
                            style={{ color: CELL_COLOR[cell.status] }}
                            title={t('conversation.fanout.viewDiff', { slot: label, status: cell.status })}
                            checkable
                            checked={selected?.slot === label && selected.path === row.path}
                            data-testid={`fanout-cell-${label}`}
                            onCheck={() =>
                              setSelected((prev) =>
                                prev?.slot === label && prev.path === row.path ? null : { slot: label, path: row.path }
                              )
                            }
                          >
                            +{cell.additions} −{cell.deletions}
                          </Tag>
                        ) : (
                          <span className='text-t-tertiary'>·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && selectedWorktree && (
        <FanoutFileDiff
          key={`${selected.slot}:${selected.path}`}
          worktreeId={selectedWorktree}
          slot={selected.slot}
          path={selected.path}
          version={group.updated_at}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

export default FanoutCompareView;
