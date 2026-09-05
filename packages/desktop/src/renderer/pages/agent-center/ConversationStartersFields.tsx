import { Button, Input } from '@arco-design/web-react';
import React from 'react';

/**
 * ChatGPT-style conversation starters editor for 智能体中心.
 * Mirrors Settings → Assistants PromptsSection patterns; CSBU WorkMate Chinese copy.
 * Persists via Assistant `recommended_prompts` (existing Core API).
 */
type ConversationStartersFieldsProps = {
  items: string[];
  onChange: (items: string[]) => void;
};

const ConversationStartersFields: React.FC<ConversationStartersFieldsProps> = ({ items, onChange }) => {
  const [adding, setAdding] = React.useState(false);
  const [newDraft, setNewDraft] = React.useState('');
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editingDraft, setEditingDraft] = React.useState('');

  const showPanel = adding || items.length > 0;

  const handleAdd = () => {
    const trimmed = newDraft.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setAdding(false);
    setNewDraft('');
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editingDraft.trim();
    if (!trimmed) return;
    const next = [...items];
    next[editingIndex] = trimmed;
    onChange(next);
    setEditingIndex(null);
    setEditingDraft('');
  };

  const handleDelete = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingDraft('');
    }
  };

  return (
    <div className='flex flex-col gap-8px' data-testid='agent-center-conversation-starters'>
      <div className='flex items-center justify-between gap-8px'>
        <div>
          <div className='text-13px font-500 text-t-primary'>对话开场白</div>
          <div className='text-12px text-t-secondary mt-2px'>
            类似 ChatGPT 的 Conversation starters；保存后会在试跑 / 新对话欢迎页展示。
          </div>
        </div>
        <Button
          type='outline'
          size='small'
          className='!rounded-full flex-shrink-0'
          onClick={() => {
            setAdding(true);
            setEditingIndex(null);
            setEditingDraft('');
          }}
        >
          + 添加
        </Button>
      </div>

      {showPanel ? (
        <div className='space-y-6px rounded-12px border border-border-2 bg-fill-1 px-12px py-6px'>
          {items.length > 0 ? (
            <div className='space-y-4px'>
              {items.map((prompt, index) => {
                const isEditing = editingIndex === index;
                return (
                  <div
                    key={`${prompt}-${index}`}
                    className={isEditing ? 'flex items-start gap-10px' : 'flex items-center gap-10px'}
                  >
                    <div
                      className={
                        isEditing
                          ? 'w-24px pt-9px text-right text-12px font-500 leading-18px text-t-quaternary'
                          : 'flex h-36px w-24px items-center justify-end text-right text-12px font-500 leading-18px text-t-quaternary'
                      }
                    >
                      {index + 1}.
                    </div>
                    <div className='min-w-0 flex-1'>
                      {isEditing ? (
                        <div className='space-y-8px'>
                          <Input
                            value={editingDraft}
                            onChange={setEditingDraft}
                            data-testid={`agent-center-starter-edit-${index}`}
                          />
                          <div className='flex items-center gap-8px'>
                            <Button size='small' type='primary' className='!rounded-full' onClick={handleSaveEdit}>
                              保存
                            </Button>
                            <Button
                              size='small'
                              type='secondary'
                              className='!rounded-full'
                              onClick={() => {
                                setEditingIndex(null);
                                setEditingDraft('');
                              }}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className='flex items-center gap-12px'>
                          <div className='flex h-36px flex-1 items-center px-4px text-13px font-500 leading-18px text-t-primary'>
                            {prompt}
                          </div>
                          <div className='flex flex-shrink-0 items-center gap-8px'>
                            <Button
                              size='small'
                              type='secondary'
                              className='!rounded-full'
                              onClick={() => {
                                setEditingIndex(index);
                                setEditingDraft(prompt);
                              }}
                            >
                              编辑
                            </Button>
                            <Button
                              size='small'
                              type='secondary'
                              className='!rounded-full'
                              onClick={() => handleDelete(index)}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {adding ? (
            <div className='flex items-center gap-8px rounded-10px bg-base p-4px'>
              <Input
                value={newDraft}
                onChange={setNewDraft}
                placeholder='例如：帮我起草一份本周工作汇报'
                data-testid='agent-center-starter-new'
                onPressEnter={handleAdd}
              />
              <Button size='small' type='primary' className='!rounded-full' onClick={handleAdd}>
                添加
              </Button>
              <Button
                size='small'
                type='secondary'
                className='!rounded-full'
                onClick={() => {
                  setAdding(false);
                  setNewDraft('');
                }}
              >
                取消
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ConversationStartersFields;
