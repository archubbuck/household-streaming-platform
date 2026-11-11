import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const canonical = (value) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
export const digest = (value) => sha256(canonical(value));
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const fail = (message) => { throw new Error(message); };

// Repository manifests may select these commands, never supply executable code or shell text.
export const commandAllowlist = {
  version: 1,
  commands: {
    registry: { kind: 'internal', handler: 'validate-registry', timeoutMs: 10000, write: [] },
    'foundation-tests': { kind: 'node', args: ['--test', 'scripts/ai/tests/foundation.test.mjs'], timeoutMs: 120000, write: [] },
  },
};

// Reject traversal, Windows drive/ADS paths, UNC paths and existing link/junction ancestors.
export function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':') ||
      relative.startsWith('/') || relative.split('/').some((part) => !part || part === '.' || part === '..' ||
        /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) {
    fail(`Unsafe repository path: ${relative}`);
  }
  let current = path.resolve(root);
  if (lstatSync(current).isSymbolicLink()) fail('Repository root cannot be a symlink');
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) fail(`Symlink/reparse path rejected: ${relative}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return current;
}

export function walk(root, relative) {
  const absolute = safePath(root, relative);
  if (!existsSync(absolute)) return [];
  if (!lstatSync(absolute).isDirectory()) return [relative];
  return readdirSync(absolute).sort().flatMap((name) => walk(root, `${relative}/${name}`));
}

export function writeJson(root, relative, value, exclusive = false) {
  const file = safePath(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: exclusive ? 'wx' : 'w', mode: 0o600 });
}

export function validateSchema(root, schemaPath, value) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson(safePath(root, schemaPath)));
  if (!validate(value)) fail(`Schema validation failed (${schemaPath}): ${ajv.errorsText(validate.errors)}`);
}

const inventoryRoots = ['scripts', 'docs/adr', 'docs/operations',
  '.github/agents', '.github/skills', '.github/instructions', '.github/prompts', '.github/hooks'];

export function validateWorkflowPolicy(root, workflow, inputs) {
  validateSchema(root, '.agents/schemas/workflow.schema.json', workflow);
  if (workflow.inputs.type !== 'object' || workflow.inputs.additionalProperties !== false) fail('Workflow inputs must be a closed object schema');
  const ajv = new Ajv({ strict: true, allErrors: true });
  const validate = ajv.compile(workflow.inputs);
  if (inputs !== undefined && !validate(inputs)) fail(`Invalid workflow inputs: ${ajv.errorsText(validate.errors)}`);
  const ids = new Set();
  for (const step of workflow.steps) {
    if (ids.has(step.id) || ['source-unchanged', 'commit-bound'].includes(step.id)) fail('Duplicate or reserved step ID');
    ids.add(step.id);
    if (!Object.hasOwn(commandAllowlist.commands, step.command)) fail('Command is not allowlisted');
    if (step.id !== step.command) fail('Check ID must equal its command ID');
  }
  const required = [...workflow.steps.map((step) => step.id), 'source-unchanged', 'commit-bound'].sort();
  if (canonical([...workflow.completion.require].sort()) !== canonical(required) ||
      mandatoryGates.some((gate) => !required.includes(gate))) fail('Workflow cannot omit mandatory gates or step evidence');
}

export function loadRegistry(root) {
  const manifests = walk(root, '.agents/manifests');
  if (!manifests.length || manifests.some((file) => !file.endsWith('.json'))) fail('Missing or invalid capability manifests');
  const capabilities = manifests.flatMap((file) => {
    const manifest = readJson(safePath(root, file));
    validateSchema(root, '.agents/schemas/capability.schema.json', manifest);
    return manifest.capabilities;
  }).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const byId = new Map();
  const covered = new Set();
  for (const capability of capabilities) {
    if (byId.has(capability.id)) fail(`Duplicate capability: ${capability.id}`);
    byId.set(capability.id, capability);
    for (const file of [capability.entrypoint, ...capability.resources]) {
      if (!lstatSync(safePath(root, file)).isFile()) fail(`Entrypoint/resource must be a file: ${file}`);
      covered.add(file);
    }
    for (const permission of capability.permissions.write) safePath(root, permission);
  }
  const visited = new Set();
  function visit(id, stack = new Set()) {
    if (!byId.has(id)) fail(`Missing dependency: ${id}`);
    if (stack.has(id)) fail(`Dependency cycle: ${id}`);
    if (visited.has(id)) return;
    for (const dependency of byId.get(id).dependencies) visit(dependency, new Set([...stack, id]));
    visited.add(id);
  }
  capabilities.forEach(({ id }) => visit(id));
  if (!byId.get('core-behaviors')?.applicability.always) fail('Global core behaviors must be mandatory');
  if (canonical(readJson(safePath(root, '.agents/commands.json'))) !== canonical(commandAllowlist)) fail('Command registry differs from code allowlist');
  for (const capability of capabilities) {
    if (byId.get(capability.owner)?.type !== 'agent') fail(`Unknown specialist owner: ${capability.owner}`);
    if (capability.validations.some((id) => !Object.hasOwn(commandAllowlist.commands, id))) fail('Unknown validation command');
  }
  for (const capability of capabilities.filter((cap) => cap.type === 'workflow')) {
    const workflow = readJson(safePath(root, capability.entrypoint));
    validateWorkflowPolicy(root, workflow);
    if (workflow.id !== capability.id) fail('Workflow capability ID mismatch');
  }
  const inventory = [...walk(root, '.agents').filter((file) => !file.startsWith('.agents/manifests/')),
    ...inventoryRoots.flatMap((dir) => walk(root, dir)), 'AGENTS.md', '.github/copilot-instructions.md'];
  for (const file of inventory) if (!covered.has(file)) fail(`Unregistered capability file: ${file}`);
  const hashed = [...new Set([...manifests, ...covered, ...walk(root, '.github/workflows'),
    'package.json', 'pnpm-workspace.yaml', '.npmrc', '.gitignore',
    ...(existsSync(path.join(root, 'pnpm-lock.yaml')) ? ['pnpm-lock.yaml'] : []),
    ...(existsSync(path.join(root, '.agents/commands.json')) ? ['.agents/commands.json'] : [])])].sort();
  const registryHash = digest(hashed.map((file) => [file, sha256(readFileSync(safePath(root, file)))]));
  return { capabilities, byId, registryHash, inventory: [...new Set(inventory)].sort() };
}

export function matchCapabilities(registry, task) {
  if (typeof task !== 'string' || !task.trim() || task.length > 2000) fail('Task must contain 1–2000 characters');
  const selected = new Set();
  function include(id) {
    if (selected.has(id)) return;
    selected.add(id);
    registry.byId.get(id).dependencies.forEach(include);
  }
  const normalized = task.toLowerCase();
  for (const cap of registry.capabilities) {
    if (cap.applicability.always || cap.applicability.keywords.some((word) => normalized.includes(word.toLowerCase()))) include(cap.id);
  }
  return [...selected].sort();
}

export function instructionPaths(registry, selected) {
  return [...new Set(selected.flatMap((id) => {
    const cap = registry.byId.get(id);
    return [cap.entrypoint, ...cap.resources].filter((file) => file.endsWith('.md'));
  }))].sort();
}

export const mandatoryGates = ['registry', 'foundation-tests', 'source-unchanged', 'commit-bound'];
export const limitations = [
  'Only the M0 foundation workflow is implemented; product workflows are unavailable.',
  'Roku model, OS, SDK and sideload validation: blocked pending actual device verification.',
  'Jellyfin configuration, storage paths and authorized sources: unverified.',
];

function receiptKey(root, create = false) {
  const file = safePath(root, '.artifacts/receipt-key');
  if (!existsSync(file) && create) {
    mkdirSync(path.dirname(file), { recursive: true });
    try { writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const key = readFileSync(file);
  if (key.length !== 32) fail('Invalid local receipt key');
  return key;
}

export function sign(root, payload, create = false) {
  return createHmac('sha256', receiptKey(root, create)).update(canonical(payload)).digest('hex');
}

export function verifySignature(root, document) {
  const { signature, ...payload } = document;
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) fail('Missing or invalid signature');
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(root, payload), 'hex'))) fail('Signature mismatch');
  return payload;
}

export function discover(root, task, now = new Date()) {
  const registry = loadRegistry(root);
  const selectedCapabilities = matchCapabilities(registry, task);
  const payload = {
    version: 1, sessionId: randomUUID(), taskFingerprint: sha256(task), registryHash: registry.registryHash,
    selectedCapabilities, instructions: instructionPaths(registry, selectedCapabilities), mandatoryGates,
    timestamp: now.toISOString(), expiresAt: new Date(now.getTime() + 86400000).toISOString(),
    missingCapabilities: limitations,
  };
  const receipt = { ...payload, signature: sign(root, payload, true) };
  writeJson(root, `.artifacts/sessions/${payload.sessionId}/discovery.json`, receipt, true);
  return receipt;
}

export function validateId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) fail('Invalid session/run UUID');
  return id;
}

export function verifySession(root, sessionId, task, now = new Date()) {
  validateId(sessionId);
  const receipt = readJson(safePath(root, `.artifacts/sessions/${sessionId}/discovery.json`));
  verifySignature(root, receipt);
  const registry = loadRegistry(root);
  if (receipt.version !== 1 || receipt.sessionId !== sessionId || receipt.taskFingerprint !== sha256(task)) fail('Receipt task/session mismatch');
  if (receipt.registryHash !== registry.registryHash) fail('Registry changed; run fresh discovery');
  const issued = Date.parse(receipt.timestamp);
  const expiry = Date.parse(receipt.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expiry) || issued > now.getTime() || expiry <= now.getTime() || expiry - issued !== 86400000) fail('Receipt expired or invalid timestamp');
  const selected = matchCapabilities(registry, task);
  if (canonical(selected) !== canonical(receipt.selectedCapabilities) ||
      canonical(instructionPaths(registry, selected)) !== canonical(receipt.instructions) ||
      canonical(mandatoryGates) !== canonical(receipt.mandatoryGates)) fail('Receipt capabilities or gates mismatch');
  return { receipt, registry };
}