import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { api, configureApi, resetApi, setUnauthorizedHandler } from '@/src/services/api';

function respondWith(status: number): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const response = { status, statusText: '', headers: {}, config, data: {} };
    if (status >= 400) throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, response);
    return response;
  };
}

describe('api 401 handling', () => {
  const handler = jest.fn();

  beforeEach(() => {
    handler.mockReset();
    setUnauthorizedHandler(handler);
  });

  afterEach(() => {
    setUnauthorizedHandler(null);
    resetApi();
  });

  it('uses https when the connection is secure', () => {
    configureApi('h', '443', 'wmd_a', true);
    expect(api.defaults.baseURL).toBe('https://h:443');
  });

  it('calls the handler when the current token gets a 401', async () => {
    configureApi('h', '1', 'wmd_a');
    await expect(api.get('/api/inbox', { adapter: respondWith(401) })).rejects.toBeInstanceOf(AxiosError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores a 401 for a token that is no longer current', async () => {
    configureApi('h', '1', 'wmd_a');
    await expect(
      api.get('/api/inbox', { adapter: respondWith(401), headers: { Authorization: 'Bearer wmd_old' } })
    ).rejects.toBeInstanceOf(AxiosError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores other errors and success', async () => {
    configureApi('h', '1', 'wmd_a');
    await expect(api.get('/x', { adapter: respondWith(403) })).rejects.toBeInstanceOf(AxiosError);
    await expect(api.get('/x', { adapter: respondWith(200) })).resolves.toMatchObject({ status: 200 });
    expect(handler).not.toHaveBeenCalled();
  });
});
