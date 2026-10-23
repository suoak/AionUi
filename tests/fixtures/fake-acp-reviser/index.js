#!/usr/bin/env node
/**
 * Fake ACP agent that revises files from a `[[AION_REVIEW ...]]` block.
 *
 * Each annotation body of the form `REPLACE: <old> => <new>` is applied to the
 * file named in the thread header (`#N <path>  L<n>...`), relative to the
 * session cwd. Prompts are appended as JSONL to $FAKE_ACP_LOG when set.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const sessions = new Map();
let counter = 0;

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');

function log(entry) {
  if (process.env.FAKE_ACP_LOG) fs.appendFileSync(process.env.FAKE_ACP_LOG, JSON.stringify(entry) + '\n');
}

function applyReview(cwd, text) {
  const applied = [];
  let file = null;
  for (const line of text.split('\n')) {
    const header = /^#\d+ (.+?) {2}L\d+/.exec(line);
    if (header) {
      file = header[1];
      continue;
    }
    const edit = /^批注：REPLACE: (.+?) => (.*)$/.exec(line);
    if (edit && file) {
      const target = path.resolve(cwd, file);
      if (!target.startsWith(path.resolve(cwd) + path.sep)) continue;
      const before = fs.readFileSync(target, 'utf8');
      if (!before.includes(edit[1])) continue;
      fs.writeFileSync(target, before.replace(edit[1], edit[2]));
      applied.push(file);
    }
  }
  return applied;
}

function handle({ id, method, params }) {
  switch (method) {
    case 'initialize':
      return send({
        id,
        result: {
          protocolVersion: 1,
          agentCapabilities: { loadSession: false },
          serverInfo: { name: 'fake-acp-reviser', version: '1.0.0' },
        },
      });
    case 'session/new': {
      const sessionId = `reviser-${++counter}`;
      sessions.set(sessionId, params?.cwd || process.cwd());
      return send({ id, result: { sessionId, modes: [], configOptions: [] } });
    }
    case 'session/prompt': {
      const sessionId = params?.sessionId;
      const cwd = sessions.get(sessionId) || process.cwd();
      const text = (params?.prompt || [])
        .filter((p) => p && p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      const applied = text.includes('[[AION_REVIEW') ? applyReview(cwd, text) : [];
      log({ sessionId, cwd, text, applied });
      const reply = applied.length ? `Revised ${applied.length} annotation(s): ${applied.join(', ')}` : 'No changes';
      send({
        method: 'session/update',
        params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } } },
      });
      return send({ id, result: { stopReason: 'end_turn' } });
    }
    case 'session/cancel':
      return undefined;
    default:
      if (id === undefined) return undefined;
      if (method && method.startsWith('session/set_')) return send({ id, result: {} });
      return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

readline.createInterface({ input: process.stdin, terminal: false }).on('line', (line) => {
  if (!line.trim()) return;
  try {
    handle(JSON.parse(line));
  } catch (err) {
    log({ error: String(err) });
  }
});
process.stdin.resume();
