import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  discover, loadRegistry, matchCapabilities, readJson, safePath, verifySession, writeJson,
} from '../core.mjs';
import { loadWorkflow, reportExitCode, runWorkflow, sourceState, verifyEvidence } from '../runner.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const task = 'Implement M0 foundation';
const fixedNow = new Date('2026-01-01T12:00:00Z');

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
}

function fixture(t, { committed = false, testBody } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'household-m0-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  for (const entry of ['.agents', '.github', '.vscode', 'apps', 'scripts', 'docs', 'knowledge', 'README.md', 'AGENTS.md', '.mcp.json', 'household_streaming_platform_specification.md', '.gitignore', '.gitattributes', '.npmrc', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
    if (existsSync(path.join(source, entry))) cpSync(path.join(source, entry), path.join(root, entry), { recursive: true });
  }
  const dependencies = path.join(source, 'node_modules/.pnpm/ajv@8.20.0/node_modules');
  for (const dependency of ['ajv', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string']) {
    const target = path.join(root, 'node_modules', dependency);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(dependencies, dependency), target, { recursive: true, dereference: true });
  }
  // The runner integration uses a small isolated test, not recursive execution of this suite.
  writeFileSync(path.join(root, 'scripts/ai/tests/foundation.test.mjs'), testBody ??
    "import test from 'node:test'; import assert from 'node:assert/strict'; test('fixture check', () => assert.equal(2 + 2, 4));\n");
  writeFileSync(path.join(root, 'scripts/ai/tests/knowledge.test.mjs'),
    "import test from 'node:test'; test('fixture knowledge check', () => {});\n");
  writeFileSync(path.join(root, 'scripts/roku/tests/inspection.test.mjs'),
    "import test from 'node:test'; test('fixture Roku offline check', () => {});\n");
  git(root, 'init', '--quiet');
  if (committed) commit(root);
  return root;
}

function commit(root) {
  git(root, 'add', '.');
  git(root, '-c', 'user.name=M0 Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Isolated test fixture');
}

function editJson(root, relative, mutate) {
  const value = readJson(path.join(root, relative));
  mutate(value);
  writeJson(root, relative, value);
}

function run(root) {
  const receipt = discover(root, task);
  const options = { workflow: 'foundation-check', session: receipt.sessionId, task, inputs: {} };
  return { receipt, report: runWorkflow(root, options), options };
}

test('repository capability inventory is complete and deterministic', () => {
  const first = loadRegistry(source);
  assert.equal(first.registryHash, loadRegistry(source).registryHash);
  assert.ok(first.byId.has('foundation-check'));
  assert.ok(first.inventory.includes('scripts/ai/tests/foundation.test.mjs'));
});

test('matching loads global behaviors, specialists and transitive dependencies', () => {
  const selected = matchCapabilities(loadRegistry(source), 'Implement Roku search');
  for (const id of ['core-behaviors', 'roku', 'quality', 'foundation-check', 'workflow-runner', 'discovery', 'capability-schema']) assert.ok(selected.includes(id), id);
  assert.ok(!selected.includes('catalog'));
});

test('strict capability schema rejects missing metadata and unknown fields', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/manifests/foundation.json', (doc) => { delete doc.capabilities[0].owner; doc.capabilities[0].arbitrary = true; });
  assert.throws(() => loadRegistry(root), /Schema validation failed/);
});

test('unregistered capability files fail discovery rather than being ignored', (t) => {
  const root = fixture(t);
  writeFileSync(path.join(root, '.agents/behaviors/unregistered.md'), 'Do not silently ignore me');
  assert.throws(() => discover(root, task), /Unregistered capability file/);
  assert.ok(!existsSync(path.join(root, '.artifacts')));
});

test('missing entrypoints and invalid manifest formats fail closed', (t) => {
  const root = fixture(t);
  rmSync(path.join(root, '.agents/behaviors/core.md'));
  assert.throws(() => loadRegistry(root), /ENOENT/);
  writeFileSync(path.join(root, '.agents/manifests/invalid.md'), '{}');
  assert.throws(() => loadRegistry(root), /invalid capability manifests/);
});

test('duplicate capabilities fail registry validation', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/manifests/foundation.json', (doc) => doc.capabilities.push(doc.capabilities[0]));
  assert.throws(() => loadRegistry(root), /Duplicate capability/);
});

test('dependency cycles and unresolved dependencies fail registry validation', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/manifests/foundation.json', (doc) => doc.capabilities[0].dependencies.push(doc.capabilities[0].id));
  assert.throws(() => loadRegistry(root), /Dependency cycle/);
  editJson(root, '.agents/manifests/foundation.json', (doc) => { doc.capabilities[0].dependencies = ['absent']; });
  assert.throws(() => loadRegistry(root), /Missing dependency/);
});

test('global behaviors cannot be made optional', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/manifests/foundation.json', (doc) => { doc.capabilities.find((cap) => cap.id === 'core-behaviors').applicability.always = false; });
  assert.throws(() => loadRegistry(root), /must be mandatory/);
});

test('manifest traversal is rejected', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/manifests/foundation.json', (doc) => { doc.capabilities[0].entrypoint = '../outside.md'; });
  assert.throws(() => loadRegistry(root), /Unsafe repository path/);
});

test('Windows aliases, traversal, ADS, absolute and UNC paths are rejected', (t) => {
  const root = fixture(t);
  for (const value of ['../outside', '/absolute', 'C:/outside', '\\\\server\\share', 'a\\b', 'a/../b', 'a//b', 'a:stream', 'NUL', 'trailing.', 'trailing ', 'a\0b']) {
    assert.throws(() => safePath(root, value), /Unsafe repository path/, value);
  }
});

test('junction and symlink ancestors cannot escape artifact roots', (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(path.join(os.tmpdir(), 'household-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, path.join(root, '.artifacts'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => discover(root, task), /Symlink\/reparse/);
  assert.ok(!existsSync(path.join(outside, 'receipt-key')));
});

test('every discovery creates a distinct session with the same deterministic match', (t) => {
  const root = fixture(t);
  const a = discover(root, task, fixedNow);
  const b = discover(root, task, fixedNow);
  assert.notEqual(a.sessionId, b.sessionId);
  assert.equal(a.registryHash, b.registryHash);
  assert.equal(a.taskFingerprint, b.taskFingerprint);
  assert.deepEqual(a.selectedCapabilities, b.selectedCapabilities);
  assert.equal(verifySession(root, a.sessionId, task, fixedNow).receipt.sessionId, a.sessionId);
});

test('task scope changes invalidate a receipt', (t) => {
  const root = fixture(t);
  const receipt = discover(root, task, fixedNow);
  assert.throws(() => verifySession(root, receipt.sessionId, `${task} changed`, fixedNow), /task\/session mismatch/);
});

test('instruction and lockfile changes invalidate receipts', (t) => {
  const root = fixture(t);
  const receipt = discover(root, task, fixedNow);
  writeFileSync(path.join(root, '.agents/behaviors/core.md'), 'Changed mandatory instructions');
  assert.throws(() => verifySession(root, receipt.sessionId, task, fixedNow), /Registry changed/);
  const next = discover(root, task, fixedNow);
  writeFileSync(path.join(root, 'pnpm-lock.yaml'), '# changed lockfile');
  assert.throws(() => verifySession(root, next.sessionId, task, fixedNow), /Registry changed/);
});

test('expired receipts and future timestamps fail', (t) => {
  const root = fixture(t);
  const receipt = discover(root, task, fixedNow);
  assert.throws(() => verifySession(root, receipt.sessionId, task, new Date(fixedNow.getTime() + 86400000)), /expired/);
  assert.throws(() => verifySession(root, receipt.sessionId, task, new Date(fixedNow.getTime() - 1)), /timestamp/);
});

test('manually editing receipt gates invalidates the signature', (t) => {
  const root = fixture(t);
  const receipt = discover(root, task, fixedNow);
  editJson(root, `.artifacts/sessions/${receipt.sessionId}/discovery.json`, (doc) => { doc.mandatoryGates = []; });
  assert.throws(() => verifySession(root, receipt.sessionId, task, fixedNow), /Signature mismatch/);
});

test('workflow cannot execute without a discovery receipt', (t) => {
  const root = fixture(t);
  assert.throws(() => runWorkflow(root, { workflow: 'foundation-check', session: '00000000-0000-4000-8000-000000000000', task, inputs: {} }), /ENOENT/);
  assert.ok(!existsSync(path.join(root, '.artifacts/tasks')));
});

test('unknown or nonselected workflows and extra inputs are rejected', (t) => {
  const root = fixture(t);
  const receipt = discover(root, 'Explain architecture');
  assert.throws(() => runWorkflow(root, { workflow: 'foundation-check', session: receipt.sessionId, task: 'Explain architecture', inputs: {} }), /not selected/);
  const registry = loadRegistry(root);
  assert.throws(() => loadWorkflow(root, registry, 'unknown', {}), /Unknown workflow/);
  assert.throws(() => loadWorkflow(root, registry, 'foundation-check', { shell: 'whoami' }), /Invalid workflow inputs/);
});

test('arbitrary shell commands and expanded permissions fail registry discovery', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/workflows/foundation-check.json', (doc) => { doc.steps[0].command = 'powershell'; });
  assert.throws(() => discover(root, task), /not allowlisted/);
  editJson(root, '.agents/workflows/foundation-check.json', (doc) => { doc.steps[0].command = 'registry'; doc.permissions.write = ['apps']; });
  assert.throws(() => discover(root, task), /Schema validation failed/);
});

test('workflow cannot omit gates or run unimplemented agent actions', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/workflows/foundation-check.json', (doc) => { doc.completion.require = ['registry']; });
  assert.throws(() => loadRegistry(root), /cannot omit mandatory gates/);
  editJson(root, '.agents/workflows/foundation-check.json', (doc) => { doc.steps[0].action = 'agent'; });
  assert.throws(() => loadRegistry(root), /Schema validation failed/);
});

test('command registry cannot redefine known executables', (t) => {
  const root = fixture(t);
  editJson(root, '.agents/commands.json', (doc) => { doc.commands['foundation-tests'].args = ['--eval', 'process.exit(0)']; });
  assert.throws(() => discover(root, task), /code allowlist/);
});

test('unborn worktree produces valid but blocked evidence', (t) => {
  const root = fixture(t);
  const { receipt, report } = run(root);
  assert.equal(report.commitSha, null);
  assert.equal(report.readyForMerge, false);
  assert.equal(reportExitCode(report), 2);
  assert.equal(report.checks.find((check) => check.id === 'commit-bound').status, 'blocked');
  assert.equal(verifyEvidence(root, { run: report.runId, session: receipt.sessionId, task }).readyForMerge, false);
});

test('clean committed fixture completes and verifies the entire workflow', (t) => {
  const root = fixture(t, { committed: true });
  const { receipt, report } = run(root);
  assert.equal(report.readyForMerge, true);
  assert.equal(reportExitCode(report), 0);
  assert.match(report.commitSha, /^[a-f0-9]{40,64}$/);
  assert.ok(report.checks.every((check) => check.status === 'passed'));
  assert.equal(verifyEvidence(root, { run: report.runId, session: receipt.sessionId, task }).readyForMerge, true);
});

test('offline Roku setup preserves blocked status and signed evidence without disabling foundation', (t) => {
  const root = fixture(t, { committed: true });
  const scope = 'Validate Roku MCP setup';
  const receipt = discover(root, scope);
  const report = runWorkflow(root, { workflow: 'roku-mcp-setup', session: receipt.sessionId, task: scope, inputs: {} });
  const deviceEvidencePath = `.artifacts/tasks/${report.runId}/roku-device/evidence.json`;
  const deviceEvidence = readJson(path.join(root, deviceEvidencePath));
  assert.equal(deviceEvidence.validation.status, 'blocked');
  assert.equal(deviceEvidence.commitSha, report.commitSha);
  assert.equal(deviceEvidence.sourceDigest, report.sourceDigest);
  assert.equal(Object.hasOwn(report.artifactHashes, deviceEvidencePath), true);
  assert.equal(report.checks.find((check) => check.id === 'roku-preflight').status, 'blocked');
  assert.equal(report.checks.find((check) => check.id === 'roku-preflight').exitCode, 2);
  assert.equal(reportExitCode(report), 2);
  assert.equal(verifyEvidence(root, { run: report.runId, session: receipt.sessionId, task: scope }).readyForMerge, false);
  writeJson(root, deviceEvidencePath, { ...deviceEvidence, validation: { ...deviceEvidence.validation, status: 'passed' } });
  assert.throws(() => verifyEvidence(root, { run: report.runId, session: receipt.sessionId, task: scope }), /artifact hash mismatch/);
  assert.equal(run(root).report.readyForMerge, true);
});

test('SDK installation changes invalidate availability observations in discovery', (t) => {
  const root = fixture(t);
  const receipt = discover(root, task);
  writeJson(root, 'node_modules/@roku-sdk/tooling/package.json', { version: '2.19.1' });
  assert.throws(() => verifySession(root, receipt.sessionId, task), /SDK availability changed/);
});

test('editor config and vendor skill changes invalidate the registry receipt', (t) => {
  const root = fixture(t);
  const receipt = discover(root, task);
  writeFileSync(path.join(root, '.vscode/mcp.json'), '{}');
  assert.throws(() => verifySession(root, receipt.sessionId, task), /Registry changed/);
  const fresh = discover(root, task);
  writeFileSync(path.join(root, '.agents/skills/roku-sdk-mcp-setup/SKILL.md'), 'changed');
  assert.throws(() => verifySession(root, fresh.sessionId, task), /Registry changed/);
});

test('dirty committed source is never merge-ready', (t) => {
  const root = fixture(t, { committed: true });
  writeFileSync(path.join(root, 'uncommitted.txt'), 'not committed');
  const { report } = run(root);
  assert.notEqual(report.commitSha, null);
  assert.equal(report.clean, false);
  assert.equal(report.readyForMerge, false);
});

test('failed tests remain failed and prevent merge readiness', (t) => {
  const root = fixture(t, { committed: true, testBody: "import test from 'node:test'; test('expected failure', () => { throw new Error('fixture failure'); });\n" });
  const { report } = run(root);
  assert.equal(report.checks.find((check) => check.id === 'foundation-tests').status, 'failed');
  assert.equal(reportExitCode(report), 1);
  assert.equal(report.readyForMerge, false);
});

test('source mutation during an allowlisted check invalidates completion', (t) => {
  const root = fixture(t, { committed: true, testBody: "import { writeFileSync } from 'node:fs'; writeFileSync('mutation.txt', 'changed during test');\n" });
  const { report } = run(root);
  assert.equal(report.checks.find((check) => check.id === 'source-unchanged').status, 'failed');
  assert.equal(report.readyForMerge, false);
});

test('changed product source invalidates previously valid evidence', (t) => {
  const root = fixture(t, { committed: true });
  const { receipt, report } = run(root);
  writeFileSync(path.join(root, 'new-product-file.ts'), 'export const value = 1;');
  assert.throws(() => verifyEvidence(root, { run: report.runId, session: receipt.sessionId, task }), /stale for the current source/);
});

test('tampering with reports or check artifacts cannot mark a check passed', (t) => {
  const root = fixture(t, { committed: true });
  const { receipt, report } = run(root);
  const options = { run: report.runId, session: receipt.sessionId, task };
  const file = `.artifacts/tasks/${report.runId}/validation.json`;
  editJson(root, file, (doc) => { doc.readyForMerge = false; });
  assert.throws(() => verifyEvidence(root, options), /Signature mismatch/);
  writeJson(root, file, report);
  editJson(root, report.checks[0].evidencePath, (doc) => { doc.output = 'forged'; });
  assert.throws(() => verifyEvidence(root, options), /artifact hash mismatch/);
});

test('deleting check evidence fails verification', (t) => {
  const root = fixture(t, { committed: true });
  const { receipt, report } = run(root);
  rmSync(path.join(root, report.checks[0].evidencePath));
  assert.throws(() => verifyEvidence(root, { run: report.runId, session: receipt.sessionId, task }), /ENOENT/);
});

test('artifact generation does not change source digest', (t) => {
  const root = fixture(t, { committed: true });
  const before = sourceState(root);
  run(root);
  assert.deepEqual(sourceState(root), before);
});

test('CLI provides help and rejects missing, duplicate and unknown options', () => {
  for (const args of [['--help'], ['discover', '--help'], ['run', '--help']]) {
    const result = spawnSync(process.execPath, ['scripts/ai/cli.mjs', ...args], { cwd: source, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  }
  for (const args of [['discover'], ['discover', '--task', task, '--task', task], ['inventory', '--bogus', 'yes'], ['run', '--session', '../escape']]) {
    const result = spawnSync(process.execPath, ['scripts/ai/cli.mjs', ...args], { cwd: source, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).status, 'failed');
  }
});