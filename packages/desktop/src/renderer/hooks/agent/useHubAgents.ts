import { useState, useEffect, useCallback } from 'react';
import type { HubExtensionStatus, IHubAgentItem } from '@/common/types/agent/hub';
import { ipcBridge } from '@/common';
import { collectErrorText } from '@/renderer/extensions/reasonCodes';
import { refreshManagedAgentCatalogAndAssistants } from './useManagedAgents';

function normalizeHubStatus(status: string | undefined): HubExtensionStatus | undefined {
  if (status === 'failed') return 'install_failed';
  return status as HubExtensionStatus | undefined;
}

export function useHubAgents() {
  const [agents, setAgents] = useState<IHubAgentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const extensionList = await ipcBridge.hub.getExtensionList.invoke();
      if (extensionList) {
        // Filter agents
        const agentExtensions = extensionList.filter((ext: IHubAgentItem) => ext.hubs?.includes('acpAdapters'));
        setAgents(agentExtensions);
      }
    } catch (err) {
      setError(collectErrorText(err) || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();

    // Listen to state changes from backend
    const unsubscribe = ipcBridge.hub.onStateChanged.on((payload) => {
      const status = normalizeHubStatus(payload.status);
      if (!status) return;

      setAgents((prev) =>
        prev.map((agent) => {
          if (agent.name === payload.name) {
            return {
              ...agent,
              status,
              installError: payload.error,
            };
          }
          return agent;
        })
      );

      // Hub installs can change both the management diagnostics view and
      // the generated generated-assistant catalog, so refresh both through the
      // shared helper used by AgentSettings.
      if (status === 'installed') {
        void refreshManagedAgentCatalogAndAssistants();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchAgents]);

  const runHubAction = async (action: 'install' | 'retryInstall' | 'update', name: string, failedLabel: string) => {
    try {
      const result = await ipcBridge.hub[action].invoke({ name });
      if (result && result.success === false) {
        const msg = result.msg || failedLabel;
        setAgents((prev) =>
          prev.map((agent) => (agent.name === name ? { ...agent, status: 'install_failed', installError: msg } : agent))
        );
        return msg;
      }
    } catch (err) {
      const msg = collectErrorText(err) || failedLabel;
      console.error(`${failedLabel}:`, err);
      setAgents((prev) =>
        prev.map((agent) => (agent.name === name ? { ...agent, status: 'install_failed', installError: msg } : agent))
      );
      return msg;
    }
    return undefined;
  };

  const install = async (name: string) => runHubAction('install', name, 'Install failed');
  const retryInstall = async (name: string) => runHubAction('retryInstall', name, 'Retry failed');
  const update = async (name: string) => runHubAction('update', name, 'Update failed');

  return {
    agents,
    loading,
    error,
    refresh: fetchAgents,
    install,
    retryInstall,
    update,
  };
}
