import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'node:path';
import { test, expect } from '../../fixtures';
import { httpGet, httpInvoke, httpPost } from '../../helpers/httpBridge';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import type {
  AcceptanceCriterion,
  SubmitTaskArtifactResponse,
  TaskApproval,
  TaskRun,
  TaskSession,
} from '@/common/types/agent/taskSession';

type McpServer = { id?: string; name?: string };

type StreamRegistry = {
  controllers: Record<
    string,
    { runScenario: (options?: { historyPairs?: number; lines?: number; seedHistoryOnly?: boolean }) => Promise<void> }
  >;
};

const STREAM_CONVERSATION_KEY = 'csbu-workmate:e2e-message-stream-conversation-id';

async function waitForBackend(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __backendPort?: number }).__backendPort === 'number',
    undefined,
    { timeout: 60_000 }
  );
}

async function createTaskSession(page: Page, conversationId: string, mode: 'agent' | 'plan' | 'goal') {
  return httpPost<TaskSession>(page, '/api/task-sessions', {
    title: `Packaged ${mode} smoke`,
    conversation_id: conversationId,
    mode,
    objective: `Verify ${mode} packaged behavior`,
    acceptance_criteria: [],
    status: 'ready',
    agent_type: 'codex',
  });
}

async function submitArtifact(page: Page, sessionId: string, kind: 'plan' | 'goal', acceptanceCriteria: string[] = []) {
  return httpPost<SubmitTaskArtifactResponse>(page, `/api/task-sessions/${sessionId}/artifacts`, {
    kind,
    content: `${kind} packaged smoke artifact`,
    acceptance_criteria: acceptanceCriteria,
  });
}

async function decideApproval(
  page: Page,
  sessionId: string,
  response: SubmitTaskArtifactResponse,
  decision: 'approve' | 'reject'
) {
  return httpPost<TaskApproval>(page, `/api/task-sessions/${sessionId}/approvals/${response.approval.id}/decision`, {
    decision,
    artifact_id: response.artifact.id,
    artifact_hash: response.artifact.content_hash,
  });
}

async function openRoute(page: Page, route: string): Promise<void> {
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#${route}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
}

async function resolveMainWindow(app: ElectronApplication): Promise<Page> {
  const existing = app.windows().find((window) => !window.url().startsWith('devtools://'));
  const page = existing ?? (await app.waitForEvent('window', { timeout: 60_000 }));
  await page.waitForLoadState('domcontentloaded');
  await waitForBackend(page);
  return page;
}

test.describe('M1.5 packaged release gate', () => {
  test('keeps TaskSession contracts safe across approval, completion, and restart', async ({ electronApp, page }) => {
    test.setTimeout(600_000);
    await waitForBackend(page);

    const assistants = await httpGet<Assistant[]>(page, '/api/assistants');
    const backends = new Set(assistants.map(assistantRuntimeKey));
    expect(backends.has('codex')).toBe(true);
    const codex = assistants.find((assistant) => assistantRuntimeKey(assistant) === 'codex');
    expect(codex).toBeDefined();
    console.log(
      `[M1.5] integrations codex=${backends.has('codex')} codebuddy=${backends.has('codebuddy')} ` +
        `claude=${backends.has('claude')} aion=${backends.has('aionrs')}`
    );

    const mcpServers = await httpGet<McpServer[]>(page, '/api/mcp/servers');
    expect(Array.isArray(mcpServers)).toBe(true);
    console.log(`[M1.5] MCP endpoint PASS (${mcpServers.length} configured servers)`);

    const conversation = await httpPost<{ id: string }>(page, '/api/conversations', {
      name: `M1.5 packaged smoke ${Date.now()}`,
      assistant: { id: codex!.id },
      extra: { workspace: process.cwd(), custom_workspace: true, session_mode: 'full-access' },
    });
    expect(conversation.id).toBeTruthy();

    await page.evaluate(({ key, id }) => window.sessionStorage.setItem(key, id), {
      key: STREAM_CONVERSATION_KEY,
      id: conversation.id,
    });
    await openRoute(page, `/conversation/${conversation.id}`);
    await expect(page.getByTestId('task-session-control')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(
      (id) => {
        const registry = (window as typeof window & { __CSBU_WORKMATE_E2E_MESSAGE_STREAM__?: StreamRegistry })
          .__CSBU_WORKMATE_E2E_MESSAGE_STREAM__;
        return Boolean(registry?.controllers[id]);
      },
      conversation.id,
      { timeout: 30_000 }
    );
    await page.evaluate(async (id) => {
      const registry = (window as typeof window & { __CSBU_WORKMATE_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__CSBU_WORKMATE_E2E_MESSAGE_STREAM__;
      await registry!.controllers[id].runScenario({ historyPairs: 1, lines: 8 });
    }, conversation.id);
    await expect(page.locator('[data-testid="message-list-content"]')).toContainText('Streamed line 8', {
      timeout: 30_000,
    });

    const rejected = await createTaskSession(page, conversation.id, 'plan');
    const rejectedArtifact = await submitArtifact(page, rejected.id, 'plan');
    await decideApproval(page, rejected.id, rejectedArtifact, 'reject');
    await expect(
      httpPost(page, `/api/task-sessions/${rejected.id}/execute`, {
        approval_id: rejectedArtifact.approval.id,
        artifact_id: rejectedArtifact.artifact.id,
        artifact_hash: rejectedArtifact.artifact.content_hash,
      })
    ).rejects.toThrow();
    expect(await httpGet<TaskRun[]>(page, `/api/task-sessions/${rejected.id}/runs`)).toHaveLength(0);

    const running = await createTaskSession(page, conversation.id, 'plan');
    const approvedArtifact = await submitArtifact(page, running.id, 'plan');
    await decideApproval(page, running.id, approvedArtifact, 'approve');

    const waiting = await createTaskSession(page, conversation.id, 'goal');
    const waitingArtifact = await submitArtifact(page, waiting.id, 'goal', ['remain pending after restart']);
    expect(waitingArtifact.approval.status).toBe('pending');

    const goal = await createTaskSession(page, conversation.id, 'goal');
    const goalArtifact = await submitArtifact(page, goal.id, 'goal', ['criterion one', 'criterion two']);
    await decideApproval(page, goal.id, goalArtifact, 'approve');
    const goalPlan = await submitArtifact(page, goal.id, 'plan');
    await decideApproval(page, goal.id, goalPlan, 'approve');
    const goalRun = await httpPost<TaskRun>(page, `/api/task-sessions/${goal.id}/execute`, {
      approval_id: goalPlan.approval.id,
      artifact_id: goalPlan.artifact.id,
      artifact_hash: goalPlan.artifact.content_hash,
    });
    expect(goalRun.status).toBe('completed');
    expect((await httpGet<TaskSession>(page, `/api/task-sessions/${goal.id}`)).status).toBe('paused');
    const criteria = goalArtifact.acceptance_criteria;
    expect(criteria).toHaveLength(2);
    await httpInvoke<AcceptanceCriterion>(
      page,
      'PATCH',
      `/api/task-sessions/${goal.id}/acceptance-criteria/${criteria[0].id}`,
      { status: 'passed', evidence: [{ kind: 'test_result', summary: 'first packaged criterion passed' }] }
    );
    expect((await httpGet<TaskSession>(page, `/api/task-sessions/${goal.id}`)).status).not.toBe('completed');
    await httpInvoke<AcceptanceCriterion>(
      page,
      'PATCH',
      `/api/task-sessions/${goal.id}/acceptance-criteria/${criteria[1].id}`,
      { status: 'passed', evidence: [{ kind: 'test_result', summary: 'second packaged criterion passed' }] }
    );
    expect((await httpGet<TaskSession>(page, `/api/task-sessions/${goal.id}`)).status).toBe('completed');

    await openRoute(page, '/agent-center');
    await openRoute(page, '/agent-center/new');
    await openRoute(page, '/skill-evolution');

    await page.evaluate(
      ({ sessionId, approvalId, artifactId, artifactHash }) => {
        const port = (window as unknown as { __backendPort?: number }).__backendPort;
        if (!port) throw new Error('Backend port is unavailable');
        void fetch(`http://127.0.0.1:${port}/api/task-sessions/${sessionId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approval_id: approvalId,
            artifact_id: artifactId,
            artifact_hash: artifactHash,
          }),
        }).catch(() => undefined);
      },
      {
        sessionId: running.id,
        approvalId: approvedArtifact.approval.id,
        artifactId: approvedArtifact.artifact.id,
        artifactHash: approvedArtifact.artifact.content_hash,
      }
    );
    await expect
      .poll(
        async () => (await httpGet<TaskRun[]>(page, `/api/task-sessions/${running.id}/runs`)).map((run) => run.status),
        { timeout: 30_000 }
      )
      .toEqual(['running']);
    await expect(
      httpPost(page, `/api/task-sessions/${running.id}/execute`, {
        approval_id: approvedArtifact.approval.id,
        artifact_id: approvedArtifact.artifact.id,
        artifact_hash: approvedArtifact.artifact.content_hash,
      })
    ).rejects.toThrow();
    expect(await httpGet<TaskRun[]>(page, `/api/task-sessions/${running.id}/runs`)).toHaveLength(1);

    const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    await electronApp.close();

    const executablePath = path.resolve('out/win-unpacked/CSBU WorkMate.exe');
    const restartedApp = await electron.launch({
      executablePath,
      cwd: path.dirname(executablePath),
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

    try {
      const restartedPage = await resolveMainWindow(restartedApp);
      const recoveredSession = await httpGet<TaskSession>(restartedPage, `/api/task-sessions/${running.id}`);
      expect(recoveredSession.status).toBe('paused');
      const recoveredRuns = await httpGet<TaskRun[]>(restartedPage, `/api/task-sessions/${running.id}/runs`);
      expect(recoveredRuns).toHaveLength(1);
      expect(recoveredRuns[0].status).toBe('paused');

      const pendingSession = await httpGet<TaskSession>(restartedPage, `/api/task-sessions/${waiting.id}`);
      expect(pendingSession.status).toBe('paused');
      const pendingApprovals = await httpGet<TaskApproval[]>(
        restartedPage,
        `/api/task-sessions/${waiting.id}/approvals`
      );
      expect(pendingApprovals).toHaveLength(1);
      expect(pendingApprovals[0].status).toBe('pending');
      expect(await httpGet<TaskRun[]>(restartedPage, `/api/task-sessions/${waiting.id}/runs`)).toHaveLength(0);
    } finally {
      await restartedApp.close().catch(() => undefined);
    }
  });
});
