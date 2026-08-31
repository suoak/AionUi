/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type HttpCall = { method: 'GET' | 'POST'; path: string; body?: unknown };

const httpBridgeMocks = vi.hoisted(() => {
  const calls: HttpCall[] = [];
  const provider =
    (method: HttpCall['method']) =>
    <Data, Params = undefined>(path: string | ((params: Params) => string), mapBody?: (params: Params) => unknown) => ({
      provider: vi.fn(),
      invoke: vi.fn(async (params?: Params) => {
        calls.push({
          method,
          path: typeof path === 'function' ? path(params as Params) : path,
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
    httpPut: provider('POST'),
    httpPatch: provider('POST'),
    httpDelete: provider('POST'),
    httpRequest: vi.fn(),
    stubProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    withResponseMap: vi.fn((inner: unknown) => inner),
    wsEmitter: vi.fn(emitter),
    wsMappedEmitter: vi.fn(emitter),
    stubEmitter: vi.fn(emitter),
  };
});

vi.mock('@/common/adapter/httpBridge', () => httpBridgeMocks);
vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ on: vi.fn(() => vi.fn()), emit: vi.fn() })),
  },
}));

describe('presentation HTTP contract', () => {
  beforeEach(() => {
    httpBridgeMocks.calls.length = 0;
  });

  it('flattens the deck file request and expected revision for rendering', async () => {
    const { presentation } = await import('@/common/adapter/ipcBridge');
    await presentation.render.invoke({
      file: { kind: 'project', pe_id: 'project-1', relative_path: 'decks/q1.workmate-deck.json' },
      expected_revision: 7,
    });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/presentations/render',
      body: {
        file_path: '',
        file: { kind: 'project', pe_id: 'project-1', relative_path: 'decks/q1.workmate-deck.json' },
        expected_revision: 7,
      },
    });
  });

  it('keeps the deck nested when importing a workspace asset', async () => {
    const { presentation } = await import('@/common/adapter/ipcBridge');
    await presentation.importAsset.invoke({
      deck: { file_path: '/workspace/q1.workmate-deck.json' },
      source_file: { kind: 'local', path: '/images/hero.png' },
      asset_id: 'hero',
    });

    expect(httpBridgeMocks.calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/presentations/assets/import',
      body: {
        deck: { file_path: '/workspace/q1.workmate-deck.json' },
        source_file: { kind: 'local', path: '/images/hero.png' },
        asset_id: 'hero',
      },
    });
  });

  it('encodes untrusted job identifiers in status and cancellation paths', async () => {
    const { presentation } = await import('@/common/adapter/ipcBridge');
    await presentation.job.invoke({ job_id: '../job 1' });
    await presentation.cancel.invoke({ job_id: '../job 1' });

    expect(httpBridgeMocks.calls.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'GET', path: '/api/presentations/jobs/..%2Fjob%201' },
      { method: 'POST', path: '/api/presentations/jobs/..%2Fjob%201/cancel' },
    ]);
  });
});
