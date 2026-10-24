/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type HttpCall = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
};

const httpBridgeMocks = vi.hoisted(() => {
  const calls: HttpCall[] = [];
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        const resolvedPath = typeof path === 'function' ? path(params as Params) : path;
        calls.push({
          method,
          path: resolvedPath,
          body: mapBody && params !== undefined ? mapBody(params as Params) : undefined,
        });
        return {} as Data;
      }),
    });
  const emitter = () => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() });

  return {
    calls,
    httpGet: provider('GET'),
    httpPost: provider('POST'),
    httpPut: provider('PUT'),
    httpPatch: provider('PATCH'),
    httpDelete: provider('DELETE'),
    httpRequest: vi.fn(),
    stubProvider: vi.fn((name: string, defaultValue: unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async () => defaultValue),
    })),
    withResponseMap: vi.fn(
      (
        inner: { provider: unknown; invoke: (params?: unknown) => Promise<unknown> },
        map: (raw: unknown) => unknown
      ) => ({
        provider: inner.provider,
        invoke: vi.fn(async (params?: unknown) => map(await inner.invoke(params))),
      })
    ),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({
      provider: vi.fn(),
      invoke: vi.fn(),
    })),
    buildEmitter: vi.fn(() => ({
      on: vi.fn(() => vi.fn()),
      emit: vi.fn(),
    })),
  },
}));

describe('ipcBridge task board adapter (Core E6-3 routes)', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('maps board, review and comment calls to the /api/task-sessions routes', async () => {
    const { taskSession } = await import('@/common/adapter/ipcBridge');

    await taskSession.board.get.invoke({});
    await taskSession.board.get.invoke({ project_id: 'p 1', assignee_kind: 'agent', assignee_id: 'a1', label: '' });
    await taskSession.board.update.invoke({ id: 't/1', updates: { board_status: 'todo', assignee: null } });
    await taskSession.board.review.invoke({ id: 't1', decision: 'approve' });
    await taskSession.board.review.invoke({ id: 't1', decision: 'reject', comment: 'redo' });
    await taskSession.board.comments.list.invoke({ id: 't1' });
    await taskSession.board.comments.create.invoke({ id: 't1', body: 'hi' });
    await taskSession.board.comments.edit.invoke({ id: 't1', comment_id: 'c1', body: 'edited' });

    expect(httpBridgeMocks.calls).toEqual([
      { method: 'GET', path: '/api/task-sessions/board', body: undefined },
      {
        method: 'GET',
        path: '/api/task-sessions/board?project_id=p+1&assignee_kind=agent&assignee_id=a1',
        body: undefined,
      },
      { method: 'PATCH', path: '/api/task-sessions/t%2F1/board', body: { board_status: 'todo', assignee: null } },
      { method: 'POST', path: '/api/task-sessions/t1/review', body: { decision: 'approve' } },
      { method: 'POST', path: '/api/task-sessions/t1/review', body: { decision: 'reject', comment: 'redo' } },
      { method: 'GET', path: '/api/task-sessions/t1/comments', body: undefined },
      { method: 'POST', path: '/api/task-sessions/t1/comments', body: { body: 'hi' } },
      { method: 'PATCH', path: '/api/task-sessions/t1/comments/c1', body: { body: 'edited' } },
    ]);
  });
});
