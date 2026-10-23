#!/usr/bin/env node
/**
 * Fake ACP CLI for testing.
 *
 * Minimal ACP JSON-RPC 2.0 server communicating via stdin/stdout.
 * Supports: initialize, session/new, session/prompt (streaming chunks).
 *
 * Script-write mode (M7 E3-6 fan-out E2E): with `--script <file.json>` or
 * `FAKE_ACP_SCRIPT=<file.json>`, every prompt writes the script's files into
 * the session `cwd` (the slot's worktree) before replying, so several slots
 * can produce different results from one prompt:
 *
 *   { "writes": { "src/fix.txt": "content\n" }, "reply": "Fixed it" }
 *
 * Paths are relative to `cwd`; absolute paths and `..` are rejected.
 */
const fs = require('fs');
const path = require('path');

function scriptPath() {
  const i = process.argv.indexOf('--script');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.FAKE_ACP_SCRIPT || '';
}

function loadScript() {
  const file = scriptPath();
  if (!file) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Write the script's files under `cwd`; returns the relative paths written. */
function applyWrites(script, cwd) {
  const written = [];
  if (!script || !script.writes || !cwd) return written;
  const root = path.resolve(cwd);
  for (const [rel, content] of Object.entries(script.writes)) {
    const target = path.resolve(root, rel);
    if (path.isAbsolute(rel) || (target !== root && !target.startsWith(root + path.sep))) {
      throw new Error(`fake-acp-cli: refusing to write outside cwd: ${rel}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, String(content));
    written.push(rel);
  }
  return written;
}

const sessionCwd = new Map();

const JSONRPC_VERSION = '2.0';

let sessionCounter = 0;

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, result });
  process.stdout.write(msg + '\n');
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: JSONRPC_VERSION, method, params });
  process.stdout.write(msg + '\n');
}

function handleRequest(message) {
  const { id, method, params } = message;

  switch (method) {
    case 'initialize': {
      sendResponse(id, {
        protocolVersion: 1,
        serverCapabilities: {
          streaming: true,
          sessionManagement: true,
        },
        serverInfo: {
          name: 'fake-acp-cli',
          version: '1.0.0',
        },
      });
      break;
    }

    case 'session/new': {
      sessionCounter++;
      const sessionId = `fake-session-${sessionCounter}`;
      if (params && typeof params.cwd === 'string') sessionCwd.set(sessionId, params.cwd);
      sendResponse(id, {
        sessionId,
        modes: [],
        configOptions: [],
        models: {
          currentModelId: 'fake-model-1',
          availableModels: [{ id: 'fake-model-1', name: 'Fake Model' }],
        },
      });
      break;
    }

    case 'session/prompt': {
      const sessionId = params?.sessionId || 'unknown';
      const promptText = Array.isArray(params?.prompt) && params.prompt[0]?.text ? params.prompt[0].text : 'unknown';

      let responseText = `Fake response to: ${promptText}`;
      try {
        const script = loadScript();
        if (script) {
          const written = applyWrites(script, sessionCwd.get(sessionId) || process.cwd());
          responseText = script.reply || `Wrote ${written.length} file(s): ${written.join(', ')}`;
        }
      } catch (err) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: JSONRPC_VERSION,
            id,
            error: { code: -32000, message: String(err.message || err) },
          }) + '\n'
        );
        break;
      }

      // Send streaming chunks via session/update notifications
      const chunks = [responseText.slice(0, 10), responseText.slice(10)];

      for (const chunk of chunks) {
        sendNotification('session/update', {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: chunk },
          },
        });
      }

      // Final response with end_turn
      sendResponse(id, {
        stopReason: 'end_turn',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      });
      break;
    }

    case 'session/cancel': {
      // Notification, no response needed
      break;
    }

    case 'session/set_mode':
    case 'session/set_model':
    case 'session/set_config_option': {
      sendResponse(id, {});
      break;
    }

    default: {
      if (id !== undefined) {
        const msg = JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
        process.stdout.write(msg + '\n');
      }
      break;
    }
  }
}

// Read JSON-RPC messages from stdin, one per line

const stdin = require('readline').createInterface({ input: process.stdin, terminal: false });

stdin.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const message = JSON.parse(trimmed);
    handleRequest(message);
  } catch {
    // Ignore parse errors
  }
});

// Keep process alive
process.stdin.resume();
