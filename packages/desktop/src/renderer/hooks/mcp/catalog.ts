import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer, IMcpServerTransport, ISessionMcpServer } from '@/common/config/storage';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';

type BackendMcpTransport = Exclude<IMcpServerTransport, { type: 'streamable_http' }>;

type BackendMcpPayload = {
  name: string;
  description?: string;
  transport: BackendMcpTransport;
  original_json: string;
  builtin?: boolean;
};

const isBuiltinServer = (server: IMcpServer) => server.builtin === true;

const normalizeServerName = (name: string) => name.trim().toLowerCase();

const getCatalogServerKey = (server: Pick<IMcpServer, 'id' | 'name' | 'builtin'>) => {
  const normalizedName = normalizeServerName(server.name);
  if (server.builtin === true) {
    return `builtin:${normalizedName || server.id}`;
  }
  return `user:${normalizedName || server.id}`;
};

const dedupeServers = (servers: IMcpServer[]) => {
  const seen = new Set<string>();
  const deduped: IMcpServer[] = [];

  for (const server of servers) {
    const key = getCatalogServerKey(server);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(server);
  }

  return deduped;
};

const normalizeTransportForBackend = (transport: IMcpServerTransport): BackendMcpTransport => {
  if (transport.type === 'streamable_http') {
    return {
      type: 'http',
      url: transport.url,
      headers: transport.headers,
    };
  }
  return transport;
};

export const toBackendMcpPayload = (
  server: Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>
): BackendMcpPayload => ({
  name: server.name,
  description: server.description,
  transport: normalizeTransportForBackend(server.transport),
  original_json: server.original_json || '{}',
  builtin: Boolean(server.builtin),
});

export const toSessionMcpServer = (server: Pick<IMcpServer, 'id' | 'name' | 'transport'>): ISessionMcpServer => ({
  id: server.id,
  name: server.name,
  transport: server.transport,
});

export const ensureBackendMcpCatalog = async (): Promise<{
  userServers: IMcpServer[];
  builtinServers: IMcpServer[];
  allServers: IMcpServer[];
}> => {
  const localServers = ((await getClientBusinessSetting('mcp.config').catch((): IMcpServer[] => [])) ||
    []) as IMcpServer[];
  const builtinServers = dedupeServers(localServers.filter(isBuiltinServer));
  const userServers = dedupeServers(await mcpService.listServers.invoke());

  const allServers = dedupeServers([...userServers, ...builtinServers]);

  return {
    userServers,
    builtinServers,
    allServers,
  };
};

/** Load state of the MCP catalog as seen by a conversation-creating page. */
export type McpCatalogStatus = 'loading' | 'ready' | 'failed';

/**
 * C-06: the `selected_*` keys of a conversation-create `extra`.
 *
 * Core reads a present `selected_mcp_server_ids` as an explicit allowlist and
 * freezes it, so an empty list sent because the catalog never loaded would
 * silently strip every MCP from the session. Until the catalog is ready the
 * keys are left out, and Core falls back to the assistant snapshot (or the
 * enabled servers when there is no assistant).
 */
export const buildMcpSelectionExtra = (
  catalogReady: boolean,
  selectedMcpServerIds: string[],
  selectedSessionMcpServers: ISessionMcpServer[]
): { selected_mcp_server_ids?: string[]; selected_session_mcp_servers?: ISessionMcpServer[] } =>
  catalogReady
    ? { selected_mcp_server_ids: selectedMcpServerIds, selected_session_mcp_servers: selectedSessionMcpServers }
    : {};
