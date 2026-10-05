import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http, { type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { test, expect } from '../../fixtures';
import { httpGet, httpPost } from '../../helpers/httpBridge';
import { createAionrsConversationViaBridge, type TProviderWithModel } from '../../helpers/chatAionrs';
import type {
  PlanningIsolation,
  SubmitTaskArtifactResponse,
  TaskApproval,
  TaskRun,
  TaskSession,
} from '@/common/types/agent/taskSession';

type Scenario = {
  marker: string;
  tool?: { name: string; input: Record<string, unknown> };
  hold?: boolean;
};

type CapturedRequest = {
  marker: string;
  body: {
    messages?: Array<{ role?: string; content?: unknown }>;
    tools?: Array<{ function?: { name?: string } }>;
  };
};

type AgentManagementRow = {
  id: string;
  agent_type: string;
  backend?: string;
};

class ScriptedOpenAiServer {
  private readonly server = http.createServer((request, response) => void this.handle(request, response));
  private readonly scenarios = new Map<string, Scenario>();
  private readonly heldResponses = new Map<string, ServerResponse>();
  readonly requests: CapturedRequest[] = [];
  baseUrl = '';

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to resolve scripted provider port');
    this.baseUrl = `http://127.0.0.1:${address.port}/v1`;
  }

  register(scenario: Scenario): void {
    this.scenarios.set(scenario.marker, scenario);
  }

  async waitForRequests(marker: string, count: number): Promise<void> {
    await expect
      .poll(() => this.requests.filter((request) => request.marker === marker).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(count);
  }

  release(marker: string): void {
    const response = this.heldResponses.get(marker);
    if (!response) return;
    this.heldResponses.delete(marker);
    this.sendText(response, 'Restart-interrupted response must not become an artifact.');
  }

  async close(): Promise<void> {
    for (const marker of this.heldResponses.keys()) this.release(marker);
    this.server.closeAllConnections?.();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handle(request: http.IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'm3-strict-planning-smoke' }] }));
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as CapturedRequest['body'];
    const serialized = JSON.stringify(body.messages ?? []);
    const scenario = [...this.scenarios.values()].find((candidate) => serialized.includes(candidate.marker));
    if (!scenario) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'No scripted M3 scenario matched the request' } }));
      return;
    }

    this.requests.push({ marker: scenario.marker, body });
    const hasToolResult = body.messages?.some((message) => message.role === 'tool') ?? false;
    if (scenario.hold && !hasToolResult) {
      this.heldResponses.set(scenario.marker, response);
      request.once('aborted', () => this.heldResponses.delete(scenario.marker));
      return;
    }
    if (scenario.tool && !hasToolResult) {
      this.sendToolCall(response, scenario.tool.name, scenario.tool.input);
      return;
    }
    this.sendText(response, `M3 packaged plan for ${scenario.marker}: inspect evidence, implement safely, and verify.`);
  }

  private sendToolCall(response: ServerResponse, name: string, input: Record<string, unknown>): void {
    this.sendSse(response, [
      {
        id: 'chatcmpl-m3-tool',
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: `call-${name.toLowerCase()}`,
                  type: 'function',
                  function: { name, arguments: JSON.stringify(input) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'chatcmpl-m3-tool',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      },
    ]);
  }

  private sendText(response: ServerResponse, content: string): void {
    this.sendSse(response, [
      {
        id: 'chatcmpl-m3-text',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
      },
      {
        id: 'chatcmpl-m3-text',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 12 },
      },
    ]);
  }

  private sendSse(response: ServerResponse, chunks: object[]): void {
    if (response.destroyed || response.writableEnded) return;
    const payload = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n'].join('');
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    response.end(payload);
  }
}

function sha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function waitForBackend(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    undefined,
    { timeout: 60_000 }
  );
}

async function openRoute(page: Page, route: string): Promise<void> {
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#${route}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
}

async function createTaskSession(page: Page, conversationId: string, agentType: string, title: string) {
  return httpPost<TaskSession>(page, '/api/task-sessions', {
    title,
    conversation_id: conversationId,
    mode: 'plan',
    objective: title,
    acceptance_criteria: [],
    status: 'ready',
    agent_type: agentType,
  });
}

async function createAionScenario(
  page: Page,
  provider: TProviderWithModel,
  assistantId: string,
  workspace: string,
  marker: string
): Promise<{ conversationId: string; task: TaskSession }> {
  const conversationId = await createAionrsConversationViaBridge(page, {
    name: `M3 packaged ${marker}`,
    workspace,
    provider,
    sessionMode: 'default',
  });
  const task = await createTaskSession(page, conversationId, assistantId, `M3 packaged ${marker}`);
  return { conversationId, task };
}

async function assertUiAutomaticPlanning(page: Page, conversationId: string, enabled: boolean): Promise<void> {
  await openRoute(page, `/conversation/${conversationId}`);
  const openContract = page.getByTestId('task-session-contract-open');
  await expect(openContract).toBeVisible({ timeout: 30_000 });
  await openContract.click();
  if (enabled) {
    await expect(page.getByTestId('task-session-automatic-plan-start')).toBeVisible();
    await expect(page.getByTestId('task-session-automatic-plan-unavailable')).toHaveCount(0);
  } else {
    await expect(page.getByTestId('task-session-automatic-plan-unavailable')).toBeVisible();
    await expect(page.getByTestId('task-session-automatic-plan-start')).toHaveCount(0);
  }
  await page.keyboard.press('Escape');
}

function resolvePackagedExecutable(): { executablePath: string; cwd: string } {
  const outDir = path.resolve('out');
  const candidates =
    process.platform === 'win32'
      ? ['win-unpacked/CSBU WorkMate.exe', 'win-x64-unpacked/CSBU WorkMate.exe']
      : process.platform === 'darwin'
        ? [
            'mac-arm64/CSBU WorkMate.app/Contents/MacOS/CSBU WorkMate',
            'mac/CSBU WorkMate.app/Contents/MacOS/CSBU WorkMate',
          ]
        : ['linux-unpacked/csbu-workmate', 'linux-x64-unpacked/csbu-workmate'];
  const executablePath = candidates.map((candidate) => path.join(outDir, candidate)).find(fs.existsSync);
  if (!executablePath) throw new Error(`Packaged WorkMate executable not found under ${outDir}`);
  return { executablePath, cwd: path.dirname(executablePath) };
}

async function resolveMainWindow(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((window) => !window.url().startsWith('devtools://'));
  const page = existing ?? (await app.waitForEvent('window', { timeout: 60_000 }));
  await page.waitForLoadState('domcontentloaded');
  await waitForBackend(page);
  return page;
}

test.describe('M3 packaged strict planning release gate', () => {
  test.skip(process.env.E2E_PACKAGED !== '1', 'M3 release gate must run against a packaged WorkMate build');

  test('enforces guaranteed-only automatic planning, approval, mutation denial, and restart safety', async ({
    electronApp,
    page,
  }) => {
    test.setTimeout(900_000);
    await waitForBackend(page);

    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'workmate-m3-packaged-'));
    const sentinel = path.join(workspace, 'foo.txt');
    fs.writeFileSync(sentinel, 'unchanged\n');
    const beforeHash = sha256(sentinel);
    const providerServer = new ScriptedOpenAiServer();
    await providerServer.start();

    let restartedApp: ElectronApplication | undefined;
    try {
      const providerId = `m3-packaged-${Date.now()}`;
      await httpPost(page, '/api/providers', {
        id: providerId,
        platform: 'custom',
        name: 'M3 packaged scripted provider',
        base_url: providerServer.baseUrl,
        api_key: 'm3-packaged-test-key',
        models: ['m3-strict-planning-smoke'],
        model_protocols: { 'm3-strict-planning-smoke': 'openai' },
      });
      const provider: TProviderWithModel = {
        id: providerId,
        name: 'M3 packaged scripted provider',
        platform: 'custom',
        apiKey: 'm3-packaged-test-key',
        api_key: 'm3-packaged-test-key',
        baseUrl: providerServer.baseUrl,
        base_url: providerServer.baseUrl,
        model: ['m3-strict-planning-smoke'],
        models: ['m3-strict-planning-smoke'],
        useModel: 'm3-strict-planning-smoke',
        enabled: true,
      };

      const managedAgents = await httpGet<AgentManagementRow[]>(page, '/api/agents/management');
      const aion = managedAgents.find((agent) => agent.agent_type === 'aionrs');
      expect(aion, 'Packaged WorkMate must expose the built-in Aion Agent runtime').toBeDefined();

      const normalMarker = `M3-NORMAL-${Date.now()}`;
      providerServer.register({ marker: normalMarker, tool: { name: 'Read', input: { file_path: sentinel } } });
      const normal = await createAionScenario(page, provider, aion!.id, workspace, normalMarker);
      const normalIsolation = await httpGet<PlanningIsolation>(
        page,
        `/api/task-sessions/${normal.task.id}/planning-isolation`
      );
      expect(normalIsolation.level).toBe('guaranteed');
      expect(normalIsolation.automatic_planning_enabled).toBe(true);
      await assertUiAutomaticPlanning(page, normal.conversationId, true);

      const normalResult = await httpPost<SubmitTaskArtifactResponse>(
        page,
        `/api/task-sessions/${normal.task.id}/automatic-plan`,
        { prompt: `${normalMarker}: analyze this project and propose changes without executing them.` }
      );
      expect(normalResult.artifact.kind).toBe('plan');
      expect(normalResult.approval.status).toBe('pending');
      expect((await httpGet<TaskSession>(page, `/api/task-sessions/${normal.task.id}`)).status).toBe(
        'waiting_approval'
      );
      await providerServer.waitForRequests(normalMarker, 2);
      const normalRequests = providerServer.requests.filter((request) => request.marker === normalMarker);
      expect(normalRequests[0].body.tools?.map((tool) => tool.function?.name).toSorted()).toEqual([
        'Glob',
        'Grep',
        'Read',
        'ViewImage',
      ]);
      expect(JSON.stringify(normalRequests[1].body.messages)).toContain('unchanged');

      await expect(
        httpPost(page, `/api/task-sessions/${normal.task.id}/execute`, {
          approval_id: normalResult.approval.id,
          artifact_id: normalResult.artifact.id,
          artifact_hash: normalResult.artifact.content_hash,
        })
      ).rejects.toThrow();
      expect(await httpGet<TaskRun[]>(page, `/api/task-sessions/${normal.task.id}/runs`)).toHaveLength(0);
      expect(providerServer.requests.filter((request) => request.marker === normalMarker)).toHaveLength(2);
      await httpPost<TaskApproval>(
        page,
        `/api/task-sessions/${normal.task.id}/approvals/${normalResult.approval.id}/decision`,
        {
          decision: 'approve',
          artifact_id: normalResult.artifact.id,
          artifact_hash: normalResult.artifact.content_hash,
        }
      );
      const run = await httpPost<TaskRun>(page, `/api/task-sessions/${normal.task.id}/execute`, {
        approval_id: normalResult.approval.id,
        artifact_id: normalResult.artifact.id,
        artifact_hash: normalResult.artifact.content_hash,
      });
      expect(run.status).toBe('completed');
      await providerServer.waitForRequests(normalMarker, 3);
      await expect(
        httpPost(page, `/api/task-sessions/${normal.task.id}/execute`, {
          approval_id: normalResult.approval.id,
          artifact_id: normalResult.artifact.id,
          artifact_hash: normalResult.artifact.content_hash,
        })
      ).rejects.toThrow();
      expect(await httpGet<TaskRun[]>(page, `/api/task-sessions/${normal.task.id}/runs`)).toHaveLength(1);

      const verifyDeniedTool = async (label: string, tool: { name: string; input: Record<string, unknown> }) => {
        const marker = `M3-${label}-${Date.now()}`;
        providerServer.register({ marker, tool });
        const scenario = await createAionScenario(page, provider, aion!.id, workspace, marker);
        const result = await httpPost<SubmitTaskArtifactResponse>(
          page,
          `/api/task-sessions/${scenario.task.id}/automatic-plan`,
          { prompt: `${marker}: modify foo.txt first, then provide the plan.` }
        );
        expect(result.approval.status).toBe('pending');
        await providerServer.waitForRequests(marker, 2);
        const requests = providerServer.requests.filter((request) => request.marker === marker);
        expect(JSON.stringify(requests[1].body.messages)).toContain('policy_denied');
        expect(sha256(sentinel)).toBe(beforeHash);
      };
      await verifyDeniedTool('MUTATION', {
        name: 'Write',
        input: { file_path: sentinel, content: 'mutated\n' },
      });
      await verifyDeniedTool('UNKNOWN', {
        name: 'UnclassifiedMutationAlias',
        input: { file_path: sentinel, content: 'mutated\n' },
      });

      const verifyRuntimeFailsClosed = async (
        runtime: 'codex' | 'claude' | 'codebuddy',
        expectedLevel: 'best_effort' | 'unsupported'
      ) => {
        const managedAgent = managedAgents.find((candidate) => candidate.backend === runtime);
        expect(managedAgent, `Packaged WorkMate must expose ${runtime} runtime metadata`).toBeDefined();
        const conversation = await httpPost<{ id: string }>(page, '/api/conversations', {
          name: `M3 packaged ${runtime} fail-closed`,
          type: 'acp',
          extra: { backend: runtime, workspace, custom_workspace: true, session_mode: 'full-access' },
        });
        const task = await createTaskSession(page, conversation.id, managedAgent!.id, `M3 ${runtime} fail-closed`);
        const isolation = await httpGet<PlanningIsolation>(page, `/api/task-sessions/${task.id}/planning-isolation`);
        expect(isolation.level).toBe(expectedLevel);
        expect(isolation.automatic_planning_enabled).toBe(false);
        await expect(
          httpPost(page, `/api/task-sessions/${task.id}/automatic-plan`, { prompt: 'This must fail closed.' })
        ).rejects.toThrow();
        await assertUiAutomaticPlanning(page, conversation.id, false);
      };
      await verifyRuntimeFailsClosed('codex', 'best_effort');
      await verifyRuntimeFailsClosed('claude', 'best_effort');
      await verifyRuntimeFailsClosed('codebuddy', 'unsupported');

      const restartMarker = `M3-RESTART-${Date.now()}`;
      providerServer.register({ marker: restartMarker, hold: true });
      const restart = await createAionScenario(page, provider, aion!.id, workspace, restartMarker);
      const pendingPlanning = httpPost(page, `/api/task-sessions/${restart.task.id}/automatic-plan`, {
        prompt: `${restartMarker}: inspect the workspace and create a plan.`,
      });
      await providerServer.waitForRequests(restartMarker, 1);
      expect((await httpGet<TaskSession>(page, `/api/task-sessions/${restart.task.id}`)).status).toBe('running');
      const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'));
      await electronApp.close();
      providerServer.release(restartMarker);
      await pendingPlanning.catch(() => undefined);

      const packaged = resolvePackagedExecutable();
      restartedApp = await electron.launch({
        executablePath: packaged.executablePath,
        cwd: packaged.cwd,
        env: {
          ...process.env,
          CSBU_WORKMATE_CDP_PORT: '0',
          CSBU_WORKMATE_DISABLE_AUTO_UPDATE: '1',
          CSBU_WORKMATE_DISABLE_DEVTOOLS: '1',
          CSBU_WORKMATE_E2E_TEST: '1',
          CSBU_WORKMATE_E2E_USER_DATA_DIR: userDataDir,
          NODE_ENV: 'production',
        },
        timeout: 60_000,
      });
      const restartedPage = await resolveMainWindow(restartedApp);
      const recovered = await httpGet<TaskSession>(restartedPage, `/api/task-sessions/${restart.task.id}`);
      expect(recovered.status).toBe('paused');
      expect(await httpGet<TaskRun[]>(restartedPage, `/api/task-sessions/${restart.task.id}/runs`)).toHaveLength(0);
      expect(
        await httpGet<TaskApproval[]>(restartedPage, `/api/task-sessions/${restart.task.id}/approvals`)
      ).toHaveLength(0);
      const recoveredIsolation = await httpGet<PlanningIsolation>(
        restartedPage,
        `/api/task-sessions/${restart.task.id}/planning-isolation`
      );
      expect(recoveredIsolation.level).toBe('guaranteed');
      expect(recoveredIsolation.automatic_planning_enabled).toBe(true);
      expect(sha256(sentinel)).toBe(beforeHash);
    } finally {
      await restartedApp?.close().catch(() => undefined);
      await providerServer.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
