import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  canonical, commandAllowlist, digest, fail, loadRegistry, readJson, safePath, sha256,
  sign, validateId, validateSchema, validateWorkflowPolicy, verifySession, verifySignature, writeJson,
} from './core.mjs';

export function loadWorkflow(root, registry, id, inputs) {
  if (canonical(readJson(safePath(root, '.agents/commands.json'))) !== canonical(commandAllowlist)) fail('Command registry differs from code allowlist');
  const capability = registry.byId.get(id);
  if (capability?.type !== 'workflow') fail('Unknown workflow');
  if (canonical(capability.permissions.write) !== canonical(['.artifacts/tasks'])) fail('Workflow capability permissions must match the artifact-only runner');
  const workflow = readJson(safePath(root, capability.entrypoint));
  validateWorkflowPolicy(root, workflow, inputs);
  if (workflow.id !== id) fail('Workflow ID mismatch');
  return workflow;
}

function git(root, args, optional = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    if (optional) return null;
    fail('Git source snapshot failed');
  }
  return result.stdout;
}

export function sourceState(root) {
  const commitSha = git(root, ['rev-parse', '--verify', 'HEAD'], true)?.trim() ?? null;
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const files = [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
  const entries = files.map((file) => {
    try { return [file, sha256(readFileSync(safePath(root, file)))]; }
    catch (error) { if (error.code === 'ENOENT') return [file, 'deleted']; throw error; }
  });
  return { commitSha, sourceDigest: digest(entries), clean: Boolean(commitSha) && status.length === 0 };
}

function execute(root, command) {
  if (command === 'registry') {
    try { return { exitCode: 0, output: { registryHash: loadRegistry(root).registryHash } }; }
    catch (error) { return { exitCode: 1, output: { reason: error.message } }; }
  }
  const spec = commandAllowlist.commands[command];
  if (!spec || spec.kind !== 'node') fail('Command is not allowlisted');
  const env = { ...process.env };
  // Avoid inherited Node preload/loader options altering registered commands.
  delete env.NODE_OPTIONS;
  // A nested `node --test` must be a new runner, not inherit the parent's worker context.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, spec.args, {
    cwd: root, encoding: 'utf8', shell: false, windowsHide: true,
    timeout: spec.timeoutMs, maxBuffer: 4 * 1024 * 1024, env,
  });
  return {
    exitCode: result.status ?? 1,
    output: { stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.code ?? null, signal: result.signal },
  };
}

export function runWorkflow(root, { workflow: id, session, task, inputs }) {
  const { receipt, registry } = verifySession(root, session, task);
  if (!receipt.selectedCapabilities.includes(id)) fail('Workflow not selected by discovery; refine scope and rediscover');
  const workflow = loadWorkflow(root, registry, id, inputs);
  const before = sourceState(root);
  const runId = randomUUID();
  const base = `.artifacts/tasks/${runId}`;
  const startedAt = new Date().toISOString();
  const artifacts = [];
  function artifact(name, value) {
    const file = `${base}/${name}`;
    writeJson(root, file, value, true);
    artifacts.push(file);
    return file;
  }
  const taskDocument = { version: 1, runId, sessionId: session, taskFingerprint: receipt.taskFingerprint, workflow: id, inputs, timestamp: startedAt };
  validateSchema(root, '.agents/schemas/task.schema.json', taskDocument);
  artifact('task.json', taskDocument);
  artifact('discovery.json', receipt);
  artifact('context.json', { ...before, registryHash: registry.registryHash, selectedCapabilities: receipt.selectedCapabilities });
  artifact('plan.json', { workflow: id, inputs, steps: workflow.steps, required: workflow.completion.require });
  const checks = [];
  for (const step of workflow.steps) {
    const stepStarted = new Date().toISOString();
    const result = execute(root, step.command);
    const evidencePath = artifact(`evidence/${step.id}.json`, result);
    checks.push({ id: step.id, command: step.command === 'registry' ? ['internal:validate-registry'] : ['node', ...commandAllowlist.commands[step.command].args],
      status: result.exitCode === 0 ? 'passed' : 'failed', exitCode: result.exitCode,
      startedAt: stepStarted, finishedAt: new Date().toISOString(), evidencePath,
      reason: result.exitCode === 0 ? '' : 'Registered check failed; inspect evidence',
    });
  }
  const after = sourceState(root);
  const unchanged = canonical(before) === canonical(after);
  const finishedAt = new Date().toISOString();
  for (const gate of [
    { id: 'source-unchanged', status: unchanged ? 'passed' : 'failed', reason: unchanged ? '' : 'Source changed during validation' },
    { id: 'commit-bound', status: before.clean ? 'passed' : 'blocked', reason: before.clean ? '' : 'Requires a clean committed Git worktree; no commit is created automatically' },
  ]) {
    const exitCode = gate.status === 'passed' ? 0 : gate.status === 'blocked' ? null : 1;
    const evidencePath = artifact(`evidence/${gate.id}.json`, { before, after, status: gate.status, exitCode });
    checks.push({ ...gate, command: ['internal:source-state'], exitCode, startedAt, finishedAt, evidencePath });
  }
  artifact('execution.json', { startedAt, finishedAt, checks });
  const readyForMerge = before.clean && checks.every((check) => check.status === 'passed');
  const summaryPath = `${base}/summary.md`;
  writeFileSync(safePath(root, summaryPath), [
    '# Foundation validation', '', `- Run: ${runId}`, `- Session: ${session}`, `- Commit: ${before.commitSha ?? 'unborn'}`,
    `- Source digest: ${before.sourceDigest}`, `- Ready for merge: ${readyForMerge}`, '',
    ...checks.map((check) => `- ${check.id}: **${check.status}**${check.reason ? ` — ${check.reason}` : ''}`),
    '', 'Scope: engineering foundation only. Roku hardware and product functionality are not validated.', '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  artifacts.push(summaryPath);
  const payload = { version: 1, runId, sessionId: session, taskFingerprint: receipt.taskFingerprint,
    workflow: id, registryHash: registry.registryHash, ...before, startedAt, finishedAt, checks, readyForMerge,
    artifactHashes: Object.fromEntries(artifacts.map((file) => [file, sha256(readFileSync(safePath(root, file)))])),
  };
  const report = { ...payload, signature: sign(root, payload) };
  validateSchema(root, '.agents/schemas/evidence.schema.json', report);
  writeJson(root, `${base}/validation.json`, report, true);
  return report;
}

export function verifyEvidence(root, { run, session, task }) {
  validateId(run);
  const { receipt, registry } = verifySession(root, session, task);
  const base = `.artifacts/tasks/${run}`;
  const report = readJson(safePath(root, `${base}/validation.json`));
  validateSchema(root, '.agents/schemas/evidence.schema.json', report);
  verifySignature(root, report);
  if (report.runId !== run || report.sessionId !== session || report.taskFingerprint !== receipt.taskFingerprint || report.registryHash !== registry.registryHash) fail('Evidence scope mismatch');
  const current = sourceState(root);
  if (current.commitSha !== report.commitSha || current.sourceDigest !== report.sourceDigest || current.clean !== report.clean) fail('Evidence is stale for the current source');
  const taskDocument = readJson(safePath(root, `${base}/task.json`));
  validateSchema(root, '.agents/schemas/task.schema.json', taskDocument);
  const workflow = loadWorkflow(root, registry, report.workflow, taskDocument.inputs);
  if (!receipt.selectedCapabilities.includes(workflow.id)) fail('Evidence workflow not selected by discovery');
  if (taskDocument.runId !== run || taskDocument.sessionId !== session || taskDocument.workflow !== report.workflow || taskDocument.taskFingerprint !== receipt.taskFingerprint) fail('Task evidence scope mismatch');
  const expectedFiles = ['task.json', 'discovery.json', 'context.json', 'plan.json', 'execution.json', 'summary.md',
    ...workflow.completion.require.map((id) => `evidence/${id}.json`)].map((file) => `${base}/${file}`).sort();
  if (canonical(Object.keys(report.artifactHashes).sort()) !== canonical(expectedFiles)) fail('Missing or unexpected evidence artifacts');
  for (const [file, hash] of Object.entries(report.artifactHashes)) {
    if (!file.startsWith(`${base}/`) || sha256(readFileSync(safePath(root, file))) !== hash) fail('Evidence artifact hash mismatch');
  }
  if (canonical(readJson(safePath(root, `${base}/discovery.json`))) !== canonical(receipt)) fail('Discovery artifact mismatch');
  if (canonical(report.checks.map((check) => check.id).sort()) !== canonical([...workflow.completion.require].sort())) fail('Missing or duplicate required checks');
  for (const check of report.checks) {
    if (check.evidencePath !== `${base}/evidence/${check.id}.json`) fail('Unexpected check evidence path');
    const evidence = readJson(safePath(root, check.evidencePath));
    if (check.exitCode !== evidence.exitCode || (check.status === 'passed' && check.exitCode !== 0)) fail('Check exit status mismatch');
  }
  const computedReady = current.clean && report.checks.every((check) => check.status === 'passed');
  if (report.readyForMerge !== computedReady) fail('Evidence readiness mismatch');
  return report;
}

export const reportExitCode = (report) => report.checks.some((check) => check.status === 'failed') ? 1 : report.readyForMerge ? 0 : 2;