import axios from 'axios';

let baseURL = '';
let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const api = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Configure the API base URL and auth token.
 * Called when the user provides connection settings.
 */
export const configureApi = (host: string, port: string, token: string, secure = false) => {
  baseURL = `${secure ? 'https' : 'http'}://${host}:${port}`;
  authToken = token;
  api.defaults.baseURL = baseURL;
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const getBaseURL = () => baseURL;
export const getAuthToken = () => authToken;

export const resetApi = () => {
  baseURL = '';
  authToken = null;
  api.defaults.baseURL = '';
  delete api.defaults.headers.common['Authorization'];
};

/**
 * Register a callback for HTTP 401 responses to requests that carried the
 * current token (device token revoked, expired or unknown). The connection
 * layer uses it to forget the token and send the user back to pairing.
 */
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const sent = error?.config?.headers?.Authorization ?? error?.config?.headers?.authorization;
    if (status === 401 && authToken && sent === `Bearer ${authToken}`) {
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);

/**
 * Refresh the auth token by calling POST /api/auth/refresh.
 * Returns the new token string, or null on failure.
 */
export async function refreshToken(currentToken: string): Promise<string | null> {
  try {
    const response = await api.post('/api/auth/refresh', { token: currentToken });
    const newToken = response.data?.token;
    return typeof newToken === 'string' ? newToken : null;
  } catch {
    return null;
  }
}
