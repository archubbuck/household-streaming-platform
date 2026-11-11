import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const canonical = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const expectedEditorConfig = {
  servers: { 'roku-sdk-inspection': { type: 'stdio', command: 'node', args: ['${workspaceFolder}/scripts/roku/editor-mcp.mjs'] } },
};
const skillPaths = ['.agents/skills/roku-sdk-mcp-setup/SKILL.md', '.agents/skills/roku-sdk-mcp-ai-dev-loop/SKILL.md'];
const sdkRoot = (root) => path.join(root, 'node_modules/@roku-sdk/tooling');
const sdkBinary = (root) => path.join(sdkRoot(root), 'bin/rk.mjs');

// Closed observations only: never return dependency errors, absolute paths or device data.
export function observeRoku(root, task = '') {
  const observation = {
    capabilityId: 'roku-mcp', status: 'blocked', reasonCodes: [],
    requiresDeviceForTask: /roku|device|playback|focus|sideload|specification/i.test(task),
    sdkToolingInstalled: false, sdkVersion: null, sdkReferenceMatches: null,
    configValid: false, officialSkillsPresent: false,
    transport: 'stdio', actualBackend: null, protocolReachable: null,
    mcpToolsAdvertised: null, advertisedToolCount: null, toolCatalogFingerprint: null,
    mcpToolsCallable: null, editorClientCallable: null,
    configuredTarget: null, deviceReachable: null, physicalValidation: 'blocked',
  };
  try {
    observation.configValid = canonical(json(path.join(root, '.vscode/mcp.json'))) === canonical(expectedEditorConfig);
  } catch { /* Missing/malformed config has the same safe diagnostic. */ }
  if (!observation.configValid) observation.reasonCodes.push('MCP_CONFIG_INVALID');
  observation.officialSkillsPresent = skillPaths.every((file) => existsSync(path.join(root, file)));
  if (!observation.officialSkillsPresent) observation.reasonCodes.push('OFFICIAL_SKILLS_MISSING');
  try {
    const installed = json(path.join(sdkRoot(root), 'package.json'));
    observation.sdkToolingInstalled = existsSync(sdkBinary(root));
    // Whitelist versions before they can become persisted evidence.
    observation.sdkVersion = /^\d+\.\d+\.\d+$/.test(installed.version) ? installed.version : null;
    const reference = json(path.join(root, 'scripts/roku/sdk-reference.json'));
    const pinned = json(path.join(root, 'package.json')).devDependencies?.['@roku-sdk/tooling'];
    observation.sdkReferenceMatches = reference.reviewed === true && installed.version === reference.toolingVersion &&
      installed.version === pinned && hash(readFileSync(path.join(sdkRoot(root), 'src/server/routes/mcp-tool-definitions.ts'))) === reference.toolDefinitionsSha256;
    if (!observation.sdkToolingInstalled) observation.reasonCodes.push('SDK_MISSING');
    if (!observation.sdkReferenceMatches) observation.reasonCodes.push('SDK_REFERENCE_DRIFT');
  } catch {
    observation.reasonCodes.push(observation.sdkToolingInstalled ? 'SDK_REFERENCE_INVALID' : 'SDK_MISSING');
  }
  if (observation.reasonCodes.length === 0) observation.status = 'degraded';
  observation.reasonCodes.push('TOOL_CALLABILITY_UNOBSERVED', 'EDITOR_ACCESS_UNOBSERVED', 'PHYSICAL_VERIFICATION_REQUIRED');
  return observation;
}

const protocolFailure = (code) => ({ status: 'blocked', errorCode: code });
export function inspectProtocol(root, execute = spawnSync) {
  const reference = json(path.join(root, 'scripts/roku/sdk-reference.json'));
  // Deliberately no tools/call, list_devices, resources/read or automatic retry.
  // SDK 2.19.1 does not implement ping; do not assume generic MCP examples apply.
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: reference.protocolVersion, capabilities: {}, clientInfo: { name: 'household-inspection', version: '1' },
    } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  let result;
  try {
    result = execute(process.execPath, [sdkBinary(root), 'mcp'], {
      cwd: root, shell: false, windowsHide: true, encoding: 'utf8', env,
      input: requests.map((request) => JSON.stringify(request)).join('\n') + '\n',
      timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
    });
  } catch { return protocolFailure('MCP_PROCESS_UNAVAILABLE'); }
  if (result.error?.code === 'ETIMEDOUT') return protocolFailure('MCP_TIMEOUT');
  if (result.error?.code === 'ENOBUFS') return protocolFailure('MCP_OUTPUT_LIMIT');
  if (result.error || result.status !== 0) return protocolFailure('MCP_PROCESS_UNAVAILABLE');
  let responses;
  try { responses = result.stdout.trim().split('\n').map((line) => JSON.parse(line)); }
  catch { return protocolFailure('MCP_PROTOCOL_INVALID'); }
  if (responses.length !== 2 || responses.some((item) => item?.jsonrpc !== '2.0') ||
      responses.filter((item) => item.id === 1).length !== 1 || responses.filter((item) => item.id === 2).length !== 1) {
    return protocolFailure('MCP_PROTOCOL_INVALID');
  }
  const initialized = responses.find((item) => item.id === 1);
  const listed = responses.find((item) => item.id === 2);
  if (initialized.error || listed.error) return protocolFailure('MCP_JSON_RPC_ERROR');
  if (initialized.result?.protocolVersion !== reference.protocolVersion || !initialized.result?.capabilities?.tools) {
    return protocolFailure('MCP_INITIALIZE_INVALID');
  }
  const tools = listed.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0 || listed.result.nextCursor ||
      tools.some((tool) => typeof tool?.name !== 'string' || !tool.inputSchema || typeof tool.inputSchema !== 'object') ||
      new Set(tools.map((tool) => tool.name)).size !== tools.length) return protocolFailure('MCP_CATALOG_INVALID');
  const fingerprint = hash(canonical([...tools].sort((a, b) => a.name.localeCompare(b.name, 'en'))));
  const matches = fingerprint === reference.advertisedCatalogFingerprint && tools.length === reference.advertisedToolCount;
  return { status: matches ? 'passed' : 'failed', errorCode: matches ? null : 'MCP_CATALOG_DRIFT',
    protocolReachable: true, mcpToolsAdvertised: true, advertisedToolCount: tools.length,
    toolCatalogFingerprint: fingerprint, actualBackend: null, mcpToolsCallable: null };
}

export function inspectRoku(root, execute = spawnSync) {
  const startedAt = new Date().toISOString();
  const observation = observeRoku(root);
  let status = 'blocked';
  let errorCode = null;
  const invalid = observation.reasonCodes.find((code) => /INVALID|DRIFT/.test(code));
  if (invalid) { status = 'failed'; errorCode = invalid; }
  else if (!observation.sdkToolingInstalled || !observation.officialSkillsPresent) {
    errorCode = observation.sdkToolingInstalled ? 'OFFICIAL_SKILLS_MISSING' : 'SDK_MISSING';
  } else {
    // SDK-managed context check writes nothing. Suppress untrusted stdout/stderr.
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.NODE_TEST_CONTEXT;
    let context;
    try { context = execute(process.execPath, [sdkBinary(root), 'update-ai-context', '--check'], {
      cwd: root, shell: false, windowsHide: true, encoding: 'utf8', env,
      timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024,
    }); } catch { context = { status: null }; }
    if (context.error || context.status === null) errorCode = 'CONTEXT_CHECK_UNAVAILABLE';
    else if (context.status !== 0) { status = 'failed'; errorCode = 'OFFICIAL_CONTEXT_DRIFT'; }
    else {
      const protocol = inspectProtocol(root, execute);
      ({ status, errorCode } = protocol);
      for (const key of ['protocolReachable', 'mcpToolsAdvertised', 'advertisedToolCount', 'toolCatalogFingerprint']) {
        if (Object.hasOwn(protocol, key)) observation[key] = protocol[key];
      }
    }
  }
  return { version: 1, scope: 'tooling-inspection-only', status, errorCode,
    startedAt, finishedAt: new Date().toISOString(), observation,
    limitations: ['No SDK tools/call performed', 'Editor connectivity unobserved', 'Actual backend unobserved',
      'No configured target or device reachability checked', 'Device adapter, leases and physical evidence not implemented'] };
}