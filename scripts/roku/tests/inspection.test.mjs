import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { digest, sha256, discover, verifySession, validateSchema } from '../../ai/core.mjs';
import { observeRoku, inspectProtocol, inspectRoku, expectedEditorConfig } from '../inspection.mjs';
import { handleRequest } from '../editor-mcp.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// Test-only advertised tool: deliberately not presented as a verified Roku operation.
const fakeTools = [{ name: 'fake_inspection', description: 'test fixture only', inputSchema: { type: 'object', properties: {} } }];
const write = (root, file, value) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
};
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'household-inspection-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  write(root, 'package.json', { devDependencies: { '@roku-sdk/tooling': '2.19.1' } });
  write(root, '.vscode/mcp.json', expectedEditorConfig);
  write(root, 'node_modules/@roku-sdk/tooling/package.json', { version: '2.19.1' });
  write(root, 'node_modules/@roku-sdk/tooling/bin/rk.mjs', '// fake; never executed');
  write(root, 'node_modules/@roku-sdk/tooling/src/server/routes/mcp-tool-definitions.ts', '// fake definitions');
  write(root, '.agents/skills/roku-sdk-mcp-setup/SKILL.md', 'fake managed setup');
  write(root, '.agents/skills/roku-sdk-mcp-ai-dev-loop/SKILL.md', 'fake managed loop');
  write(root, 'scripts/roku/sdk-reference.json', { version: 1, toolingVersion: '2.19.1', reviewed: true,
    toolDefinitionsSha256: sha256('// fake definitions'), advertisedToolCount: 1,
    advertisedCatalogFingerprint: digest(fakeTools), protocolVersion: '2025-06-18' });
  return root;
}
function response(tools = fakeTools) {
  return [{ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} } } },
    { jsonrpc: '2.0', id: 2, result: { tools } }];
}
const executed = (responses = response()) => ({ status: 0, stdout: responses.map((item) => JSON.stringify(item)).join('\n'), stderr: '' });
const fakeExecute = (_exe, args) => args.includes('update-ai-context') ? { status: 0 } : executed();

test('MCP-001: absent SDK is blocked without turning unknown device facts into false', (t) => {
  const root = fixture(t);
  rmSync(path.join(root, 'node_modules'), { recursive: true });
  const observation = observeRoku(root, 'API-only refactor');
  assert.equal(observation.sdkToolingInstalled, false);
  assert.equal(observation.requiresDeviceForTask, false);
  assert.equal(observation.deviceReachable, null);
  assert.equal(observation.mcpToolsAdvertised, null);
  const report = inspectRoku(root, () => assert.fail('Must not launch missing SDK'));
  assert.equal(report.status, 'blocked');
  assert.equal(report.errorCode, 'SDK_MISSING');
});

test('MCP-002: malformed, secret-bearing or unrestricted editor config fails closed', (t) => {
  const root = fixture(t);
  for (const config of ['invalid secret-canary', { servers: { roku: { command: 'npx', args: ['rk', 'mcp'], env: { PASSWORD: 'secret-canary' } } } }]) {
    write(root, '.vscode/mcp.json', config);
    const report = inspectRoku(root, () => assert.fail('Must not spawn from bad configuration'));
    assert.equal(report.status, 'failed');
    assert.equal(report.errorCode, 'MCP_CONFIG_INVALID');
    assert.ok(!JSON.stringify(report).includes('secret-canary'));
  }
});

test('MCP-003/014: protocol unavailable is blocked, never physical success', (t) => {
  const root = fixture(t);
  for (const result of [{ status: 1, stderr: 'secret-canary' }, { status: null, error: { code: 'ENOENT' } }]) {
    const report = inspectRoku(root, (_exe, args) => args.includes('update-ai-context') ? { status: 0 } : result);
    assert.equal(report.status, 'blocked');
    assert.equal(report.observation.physicalValidation, 'blocked');
    assert.equal(report.observation.mcpToolsCallable, null);
    assert.ok(!JSON.stringify(report).includes('secret-canary'));
  }
});

test('MCP-004: advertised tools do not establish callability or configured TV', (t) => {
  const report = inspectRoku(fixture(t), fakeExecute);
  assert.equal(report.status, 'passed');
  assert.equal(report.scope, 'tooling-inspection-only');
  assert.equal(report.observation.mcpToolsAdvertised, true);
  for (const field of ['mcpToolsCallable', 'configuredTarget', 'deviceReachable', 'editorClientCallable']) assert.equal(report.observation[field], null);
  assert.equal(report.observation.status, 'degraded');
  assert.equal(report.observation.physicalValidation, 'blocked');
  validateSchema(source, '.agents/schemas/roku-inspection.schema.json', report);
});

test('protocol probe invokes only the local binary and a fixed non-mutating request sequence', (t) => {
  const root = fixture(t);
  let calls = 0;
  const result = inspectProtocol(root, (exe, args, options) => {
    calls++;
    assert.equal(exe, process.execPath);
    assert.deepEqual(args, [path.join(root, 'node_modules/@roku-sdk/tooling/bin/rk.mjs'), 'mcp']);
    assert.equal(options.shell, false);
    assert.equal(options.cwd, root);
    assert.equal(options.timeout, 20000);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.equal(options.env.NODE_TEST_CONTEXT, undefined);
    const requests = options.input.trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(requests.map((request) => request.method), ['initialize', 'notifications/initialized', 'tools/list']);
    return executed();
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'passed');
});

test('MCP-009: raw process/protocol diagnostics never enter normalized results', (t) => {
  const root = fixture(t);
  for (const processResult of [
    { status: 0, stdout: 'secret-canary 192.0.2.1 password=hidden', stderr: 'secret-canary' },
    { status: 0, stdout: JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'secret-canary' } }) },
    { status: 1, stdout: 'secret-canary', stderr: 'secret-canary' },
  ]) {
    const report = inspectProtocol(root, () => processResult);
    assert.equal(report.status, 'blocked');
    assert.ok(!JSON.stringify(report).includes('secret-canary'));
    assert.ok(!JSON.stringify(report).includes('192.0.2.1'));
  }
});

test('MCP-011: installed version, pin and definition drift fail preflight', (t) => {
  const mutations = [
    ['node_modules/@roku-sdk/tooling/package.json', { version: '9.0.0' }],
    ['package.json', { devDependencies: { '@roku-sdk/tooling': '^2.19.1' } }],
    ['node_modules/@roku-sdk/tooling/src/server/routes/mcp-tool-definitions.ts', '// changed'],
  ];
  for (const [file, value] of mutations) {
    const root = fixture(t);
    write(root, file, value);
    const report = inspectRoku(root, () => assert.fail('Drift must prevent spawning'));
    assert.equal(report.status, 'failed');
    assert.equal(report.errorCode, 'SDK_REFERENCE_DRIFT');
  }
});

test('MCP-011: added/changed advertised tool schemas are detected', (t) => {
  const root = fixture(t);
  const changed = [{ ...fakeTools[0], inputSchema: { type: 'object', properties: { unsafe: { type: 'boolean' } } } }];
  const result = inspectProtocol(root, () => executed(response(changed)));
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'MCP_CATALOG_DRIFT');
});

test('MCP-016: managed context drift blocks live probe and never gets overwritten', (t) => {
  const root = fixture(t);
  let calls = 0;
  const result = inspectRoku(root, (_exe, args) => {
    calls++;
    assert.deepEqual(args.slice(1), ['update-ai-context', '--check']);
    return { status: 3, stdout: 'secret-canary' };
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'OFFICIAL_CONTEXT_DRIFT');
  assert.ok(!JSON.stringify(result).includes('secret-canary'));
});

test('MCP-017: stdio configuration does not imply a known execution backend', (t) => {
  const result = inspectRoku(fixture(t), fakeExecute);
  assert.equal(result.observation.transport, 'stdio');
  assert.equal(result.observation.actualBackend, null);
});

test('bounded timeout and output overflow cause no retries', (t) => {
  const root = fixture(t);
  for (const [code, expected] of [['ETIMEDOUT', 'MCP_TIMEOUT'], ['ENOBUFS', 'MCP_OUTPUT_LIMIT']]) {
    let calls = 0;
    const result = inspectProtocol(root, () => { calls++; return { status: null, error: { code } }; });
    assert.equal(calls, 1);
    assert.equal(result.status, 'blocked');
    assert.equal(result.errorCode, expected);
  }
});

test('malformed, duplicate, incomplete or paginated MCP replies cannot pass', (t) => {
  const root = fixture(t);
  const cases = [[], [response()[0]], [response()[0], response()[0]],
    response([fakeTools[0], fakeTools[0]]), response([{ name: 'bad' }]),
    [response()[0], { ...response()[1], result: { tools: fakeTools, nextCursor: 'more' } }],
    [{ ...response()[0], result: { protocolVersion: 'wrong', capabilities: { tools: {} } } }, response()[1]],
  ];
  for (const responses of cases) assert.equal(inspectProtocol(root, () => executed(responses)).status, 'blocked');
});

test('schema forbids invented physical success or extra raw output', (t) => {
  const report = inspectRoku(fixture(t), fakeExecute);
  report.observation.physicalValidation = 'passed';
  assert.throws(() => validateSchema(source, '.agents/schemas/roku-inspection.schema.json', report), /Schema validation failed/);
  report.observation.physicalValidation = 'blocked';
  report.rawOutput = 'secret';
  assert.throws(() => validateSchema(source, '.agents/schemas/roku-inspection.schema.json', report), /Schema validation failed/);
});

test('editor exposes only the inspection tool; every SDK control is denied', () => {
  const listed = handleRequest(source, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ['roku_mcp_check']);
  for (const name of ['deploy_app', 'ecp', 'device_reboot', 'device_start', 'package', 'list_devices', 'capture_screen', '__proto__']) {
    const result = handleRequest(source, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } }, () => assert.fail('Must not call SDK'));
    assert.equal(result.error.code, -32602);
  }
});

test('editor rejects missing discovery, batches and invalid IDs without executing', () => {
  const noExecute = () => assert.fail('Must not execute');
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'roku_mcp_check', arguments: { session: 'invalid', task: 'test' } } };
  assert.equal(handleRequest(source, call, noExecute).error.code, -32001);
  assert.equal(handleRequest(source, [call], noExecute).error.code, -32600);
  assert.equal(handleRequest(source, { ...call, id: {} }, noExecute).error.code, -32600);
  delete call.id;
  assert.equal(handleRequest(source, call, noExecute), null);
});

test('editor accepts exact discovery scope but does not assert editor or device verification', (t) => {
  const task = 'Validate Roku inspection protocol in isolated tests';
  const receipt = discover(source, task);
  const report = inspectRoku(fixture(t), fakeExecute);
  const result = handleRequest(source, { jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'roku_mcp_check', arguments: { session: receipt.sessionId, task } } }, () => report);
  assert.equal(result.result.isError, false);
  assert.equal(JSON.parse(result.result.content[0].text).observation.editorClientCallable, null);
  assert.equal(verifySession(source, receipt.sessionId, task).receipt.observations[0].capabilityId, 'roku-mcp');
});

test('editor stdio emits only JSON and rejects oversized input', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  const entrypoint = path.join(source, 'scripts/roku/editor-mcp.mjs');
  const result = spawnSync(process.execPath, [entrypoint], { env, input: 'not-json\n' + JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n', encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].error.code, -32700);
  assert.equal(lines[1].result.tools.length, 1);
  assert.equal(result.stderr, '');
  const eof = spawnSync(process.execPath, [entrypoint], { env, input: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), encoding: 'utf8', timeout: 10000 });
  assert.equal(eof.status, 0);
  assert.equal(JSON.parse(eof.stdout).id, 2);
  const oversized = spawnSync(process.execPath, [entrypoint], { env, input: 'x'.repeat(70000), encoding: 'utf8', timeout: 10000 });
  assert.equal(oversized.status, 1);
  assert.match(oversized.stdout, /Input limit exceeded/);
});

test('tracked reference contains observed version and fingerprints, never placeholder success', () => {
  const reference = JSON.parse(readFileSync(path.join(source, 'scripts/roku/sdk-reference.json'), 'utf8'));
  assert.equal(reference.reviewed, true);
  assert.equal(reference.toolingVersion, '2.19.1');
  assert.match(reference.toolDefinitionsSha256, /^[a-f0-9]{64}$/);
  assert.match(reference.advertisedCatalogFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(reference.advertisedToolCount, 80);
});