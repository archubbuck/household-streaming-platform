import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySession, validateSchema } from '../ai/core.mjs';
import { inspectRoku } from './inspection.mjs';

const tool = {
  name: 'roku_mcp_check', description: 'Read-only pinned SDK inspection. Does not expose or call device tools. Requires fresh repository discovery.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['session', 'task'],
    properties: { session: { type: 'string' }, task: { type: 'string', minLength: 1, maxLength: 2000 } } },
};
export function handleRequest(root, request, inspect = inspectRoku) {
  const validId = request?.id === null || typeof request?.id === 'string' ||
    (typeof request?.id === 'number' && Number.isFinite(request.id));
  const id = validId ? request.id : null;
  const error = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return error(-32600, 'Invalid request; batches are not supported');
  }
  // Never perform work from a notification, including a tools/call notification.
  if (!Object.hasOwn(request, 'id')) return null;
  if (!validId) return error(-32600, 'Invalid request ID');
  let result;
  switch (request.method) {
    case 'initialize':
      result = { protocolVersion: '2025-06-18', capabilities: { tools: {} },
        serverInfo: { name: 'household-roku-inspection', version: '1.0.0' } };
      break;
    case 'ping': result = {}; break;
    case 'tools/list': result = { tools: [tool] }; break;
    case 'tools/call': {
      const params = request.params;
      const args = params?.arguments;
      if (params?.name !== tool.name || !args || Array.isArray(args) ||
          Object.keys(params).some((key) => !['name', 'arguments'].includes(key)) ||
          Object.keys(args).sort().join(',') !== 'session,task' || typeof args.session !== 'string' ||
          typeof args.task !== 'string' || args.task.length < 1 || args.task.length > 2000) {
        return error(-32602, 'Only receipt-bound inspection is permitted; device operations are disabled');
      }
      try {
        verifySession(root, args.session, args.task);
        const report = inspect(root);
        validateSchema(root, '.agents/schemas/roku-inspection.schema.json', report);
        result = { content: [{ type: 'text', text: JSON.stringify(report) }], isError: report.status !== 'passed' };
      } catch { return error(-32001, 'Inspection rejected; refresh discovery and validate local configuration'); }
      break;
    }
    default: return error(-32601, 'Method disabled by inspection policy');
  }
  return { jsonrpc: '2.0', id, result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  let buffer = '';
  const respond = (line) => {
    if (!line.trim()) return;
    let response;
    try { response = handleRequest(root, JSON.parse(line)); }
    catch { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }; }
    if (response) process.stdout.write(JSON.stringify(response) + '\n');
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 65536) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Input limit exceeded' } }) + '\n');
      process.exit(1);
    }
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      respond(line);
    }
  });
  process.stdin.on('end', () => { respond(buffer); buffer = ''; });
  process.stdin.on('error', () => { buffer = ''; process.exitCode = 1; process.stdin.destroy(); });
  process.stdout.on('error', () => { buffer = ''; process.exitCode = 1; process.stdin.destroy(); });
}