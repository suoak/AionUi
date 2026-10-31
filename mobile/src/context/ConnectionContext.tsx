import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { wsService, type ConnectionState } from '../services/websocket';
import { configureApi, resetApi, setUnauthorizedHandler } from '../services/api';
import {
  checkDeviceToken,
  clearConnection,
  restoreConnection,
  saveConnection,
  type StoredConnection,
} from '../services/session';

export type ConnectionConfig = StoredConnection;

/** Why the phone was signed out; shown on the pairing screen. */
export type SignOutReason = 'revoked' | 'legacy_session' | null;

type ConnectionContextType = {
  config: ConnectionConfig | null;
  connectionState: ConnectionState;
  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: () => void;
  tryReconnect: () => void;
  isConfigured: boolean;
  isRestoring: boolean;
  signOutReason: SignOutReason;
  clearSignOutReason: () => void;
};

const ConnectionContext = createContext<ConnectionContextType>({
  config: null,
  connectionState: 'disconnected',
  connect: async () => {},
  disconnect: () => {},
  tryReconnect: () => {},
  isConfigured: false,
  isRestoring: true,
  signOutReason: null,
  clearSignOutReason: () => {},
});

// Do not loop when HTTP accepts the token but the socket keeps being rejected.
const MIN_RECOVERY_INTERVAL_MS = 30_000;

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isRestoring, setIsRestoring] = useState(true);
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null);
  const configRef = useRef<ConnectionConfig | null>(null);
  const lastRecoveryRef = useRef(0);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  /** Forget the device token locally and return to pairing. */
  const forgetDevice = useCallback((reason: SignOutReason) => {
    wsService.disconnect();
    resetApi();
    configRef.current = null;
    setConfig(null);
    setSignOutReason(reason);
    void clearConnection();
  }, []);

  const applyConfig = useCallback((next: ConnectionConfig) => {
    configRef.current = next;
    setConfig(next);
    configureApi(next.host, next.port, next.token, next.secure);
    wsService.configure(next.host, next.port, next.token, next.secure);
    wsService.connect();
  }, []);

  // Device tokens are not refreshed: verify with Core, then either reconnect,
  // forget the token (401 = revoked/inactive), or stay in auth_failed.
  const recover = useCallback(async (): Promise<boolean> => {
    if (!configRef.current) return false;
    const result = await checkDeviceToken();
    if (result === 'revoked') {
      // The 401 interceptor may already have forgotten the device.
      if (configRef.current) forgetDevice('revoked');
      return false;
    }
    if (result === 'valid' && Date.now() - lastRecoveryRef.current > MIN_RECOVERY_INTERVAL_MS) {
      lastRecoveryRef.current = Date.now();
      wsService.reconnect();
      return true;
    }
    return false;
  }, [forgetDevice]);

  useEffect(() => {
    wsService.setAuthChallengeHandler(recover);
    setUnauthorizedHandler(() => {
      if (configRef.current) forgetDevice('revoked');
    });
    return () => {
      wsService.setAuthChallengeHandler(null);
      setUnauthorizedHandler(null);
    };
  }, [recover, forgetDevice]);

  const tryReconnect = useCallback(() => {
    if (wsService.state === 'auth_failed') {
      lastRecoveryRef.current = 0;
      void recover();
    } else if (wsService.state === 'disconnected') {
      wsService.reconnect();
    }
  }, [recover]);

  useEffect(() => wsService.onStateChange(setConnectionState), []);

  useEffect(() => {
    (async () => {
      try {
        const restored = await restoreConnection();
        if (restored.kind === 'device') {
          applyConfig(restored.connection);
        } else if (restored.kind === 'discarded_legacy') {
          setSignOutReason('legacy_session');
        }
      } finally {
        setIsRestoring(false);
      }
    })();
  }, [applyConfig]);

  const connect = useCallback(
    async (next: ConnectionConfig) => {
      await saveConnection(next);
      setSignOutReason(null);
      applyConfig(next);
    },
    [applyConfig],
  );

  const disconnect = useCallback(() => forgetDevice(null), [forgetDevice]);
  const clearSignOutReason = useCallback(() => setSignOutReason(null), []);

  return (
    <ConnectionContext.Provider
      value={{
        config,
        connectionState,
        connect,
        disconnect,
        tryReconnect,
        isConfigured: config !== null,
        isRestoring,
        signOutReason,
        clearSignOutReason,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext);
}
