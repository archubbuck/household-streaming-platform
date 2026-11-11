import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedDocuments, updateRoadmap, validateRoadmap } from '../roadmap.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const roadmapFile = 'docs/development/roadmap.json';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'household-roadmap-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  for (const item of ['AGENTS.md', '.agents/agents/specialists.md', '.agents/behaviors/core.md', '.agents/schemas/capability.schema.json',
    '.agents/schemas/roadmap.schema.json', roadmapFile, 'README.md', 'household_streaming_platform_specification.md',
    'docs/development/implementation-status.md',
    'scripts/ai/cli.mjs', 'scripts/ai/core.mjs', 'scripts/ai/runner.mjs', 'scripts/ai/tests/foundation.test.mjs',
    'package.json', '.github/workflows/foundation.yml', '.agents/manifests/foundation.json',
    '.agents/manifests/roku.json', '.agents/workflows/roku-mcp-setup.json', 'scripts/roku/inspection.mjs',
    'scripts/roku/device-policy.mjs', 'scripts/roku/tests/inspection.test.mjs', '.agents/schemas/roku-device-evidence.schema.json',
    '.agents/templates/task-brief.md', 'docs/development/third-party-notices.md', '.agents/workflows/foundation-check.json',
    'docs/development/roku-mcp-gap-analysis.md', 'docs/adr/0002-roku-mcp-inspection.md', 'docs/operations/roku-mcp.md', 'apps/roku-preview/app.js',
    'apps/experience-api/src/preview-fixtures.ts', 'scripts/roku/tests/ui-preview.test.mjs',
    'apps/experience-api/src/app.ts', 'apps/experience-api/src/jellyfin.ts', 'apps/experience-api/src/mock-jellyfin.ts', 'apps/experience-api/src/devices.ts', 'apps/experience-api/src/api.test.ts',
    '.vscode/mcp.json', '.mcp.json']) {
    const target = path.join(root, item);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(source, item), target, { recursive: true });
  }
  return root;
}

function readRoadmap(root) {
  return JSON.parse(readFileSync(path.join(root, roadmapFile), 'utf8'));
}

test('roadmap renders deterministic README and implementation status summaries', () => {
  const roadmap = readRoadmap(source);
  const first = generatedDocuments(source, roadmap);
  const second = generatedDocuments(source, roadmap);
  assert.deepEqual(first, second);
  assert.match(first['README.md'], /M0-RK — Incremental Roku MCP integration/);
  assert.match(first['docs/development/implementation-status.md'], /Generated from \[roadmap\.json\]/);
  assert.match(first['docs/development/implementation-status.md'], /No verified named Roku target/);
});

test('roadmap check detects stale generated files and write regenerates them', (t) => {
  const root = fixture(t);
  const expected = generatedDocuments(root, readRoadmap(root));
  for (const [file, content] of Object.entries(expected)) writeFileSync(path.join(root, file), content);
  assert.deepEqual(updateRoadmap(root), { status: 'passed', stale: [] });
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  writeFileSync(path.join(root, 'README.md'), readme.replace('**Overall roadmap:**', '**Outdated roadmap:**'));
  assert.deepEqual(updateRoadmap(root), { status: 'stale', stale: ['README.md'] });
  assert.deepEqual(updateRoadmap(root, { write: true }), { status: 'written', files: ['README.md'] });
  assert.deepEqual(updateRoadmap(root), { status: 'passed', stale: [] });
});

test('roadmap rejects unknown dependencies and inconsistent complete status', () => {
  const roadmap = readRoadmap(source);
  const changed = structuredClone(roadmap);
  changed.milestones[0].packages[0].dependencies = ['M9.9'];
  assert.throws(() => validateRoadmap(source, changed), /Unknown dependency/);

  const incomplete = structuredClone(roadmap);
  incomplete.milestones[0].packages[0].evidence = [];
  assert.throws(() => validateRoadmap(source, incomplete), /lacks passing verification\/evidence/);
});

test('roadmap rejects blocked packages without reasons and unsafe evidence paths', () => {
  const roadmap = readRoadmap(source);
  const noReason = structuredClone(roadmap);
  noReason.milestones[0].packages[0].status = 'blocked';
  assert.throws(() => validateRoadmap(source, noReason), /lacks a blocker/);

  const unsafe = structuredClone(roadmap);
  unsafe.milestones[0].packages[0].evidence[0].path = '../outside';
  assert.throws(() => validateRoadmap(source, unsafe), /Invalid or missing roadmap evidence path/);
});
