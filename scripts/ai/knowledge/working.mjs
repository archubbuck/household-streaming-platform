import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { canonical, digest, fail, readJson, safePath, sha256, verifySession, writeJson } from '../core.mjs';
import { loadKnowledge } from './records.mjs';
import { closeKnowledgeStore, openKnowledgeStore } from './store.mjs';

const findingSchema = '.agents/schemas/knowledge-finding.schema.json';
const checkpointSchema = '.agents/schemas/knowledge-checkpoint.schema.json';
const recordSchema = '.agents/schemas/knowledge-record.schema.json';
const sensitivePath = /(^|\/)(?:\.env(?:\..*)?|\.artifacts|node_modules|\.git|secrets?|credentials?|private[-_]?keys?|tokens?|keys?|id_rsa|id_ed25519|[^/]*(?:secret|credential|private[-_]?key|token|keypair)[^/]*)(\/|$)/i;
const secretValue = /\b(?:api[_-]?key|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9/+=_.-]{12,}/i;
const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i;
const emailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function assertSafeText(value, label) {
  if (secretValue.test(value) || privateKey.test(value) || bearerToken.test(value) || emailAddress.test(value)) {
    fail(`Potential secret or personal data rejected in ${label}`);
  }
}

function assertSafeRepoPath(root, relative) {
  if (typeof relative !== 'string' || sensitivePath.test(relative.replaceAll('\\', '/'))) {
    fail(`Sensitive repository path rejected: ${relative}`);
  }
  return safePath(root, relative);
}

function validate(root, schemaPath, document) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const check = ajv.compile(readJson(safePath(root, schemaPath)));
  if (!check(document)) fail(`Knowledge schema validation failed (${schemaPath}): ${ajv.errorsText(check.errors)}`);
}

function currentCommit(root) {
  const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function fingerprintFinding(finding) {
  return digest({
    classification: finding.classification,
    title: finding.title.trim().toLocaleLowerCase('en'),
    details: finding.details.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en'),
  });
}

function validateFindingReferences(root, finding) {
  const knowledge = loadKnowledge(root);
  for (const id of finding.related_knowledge) {
    if (!knowledge.byId.has(id)) fail(`Unknown related knowledge record: ${id}`);
  }
  for (const reference of finding.source_refs) {
    const file = assertSafeRepoPath(root, reference.path);
    if (reference.sha256 && sha256(readFileSync(file)) !== reference.sha256) {
      fail(`Source reference hash mismatch: ${reference.path}`);
    }
  }
}

export function captureFinding(root, { session, task, finding }) {
  const { receipt } = verifySession(root, session, task);
  validate(root, findingSchema, finding);
  assertSafeText(finding.title, 'finding title');
  assertSafeText(finding.details, 'finding details');
  validateFindingReferences(root, finding);
  const fingerprint = fingerprintFinding(finding);
  const id = `finding-${fingerprint.slice(0, 24)}`;
  const now = new Date().toISOString();
  const db = openKnowledgeStore(root);
  try {
    db.exec('BEGIN IMMEDIATE');
    let existing = db.prepare('SELECT id FROM findings WHERE fingerprint = ?').get(fingerprint);
    const duplicate = Boolean(existing);
    if (!existing) {
      db.prepare(`
        INSERT INTO findings
          (id, fingerprint, classification, title, details, source_refs_json, related_knowledge_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, fingerprint, finding.classification, finding.title.trim(), finding.details.trim(),
        JSON.stringify(finding.source_refs), JSON.stringify(finding.related_knowledge), now);
      existing = { id };
    }
    db.prepare(`
      INSERT OR IGNORE INTO finding_sessions
        (finding_id, session_id, task_fingerprint, commit_sha, captured_at, source_refs_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(existing.id, session, receipt.taskFingerprint, currentCommit(root), now, JSON.stringify(finding.source_refs));
    const conflicts = db.prepare(`
      SELECT id, title FROM findings
      WHERE lower(trim(title)) = lower(trim(?)) AND id != ?
      ORDER BY id
    `).all(finding.title, existing.id);
    db.exec('COMMIT');
    return {
      id: existing.id,
      status: 'provisional',
      duplicate,
      conflicts,
      sessionId: session,
      sourceReferences: finding.source_refs.length,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally { closeKnowledgeStore(db); }
}

export function captureFindings(root, { session, task, findings }) {
  if (!Array.isArray(findings) || findings.length < 1 || findings.length > 50) {
    fail('Batch capture requires 1–50 findings');
  }
  verifySession(root, session, task);
  for (const finding of findings) {
    validate(root, findingSchema, finding);
    assertSafeText(finding.title, 'finding title');
    assertSafeText(finding.details, 'finding details');
    validateFindingReferences(root, finding);
  }
  return findings.map((finding) => captureFinding(root, { session, task, finding }));
}

function proposalRecord(root, candidate) {
  if (!candidate?.metadata || candidate.metadata.status !== 'proposed') {
    fail('Knowledge proposals must remain proposed until accepted through Git review');
  }
  validate(root, recordSchema, candidate.metadata);
  assertSafeText(candidate.body, 'proposal body');
  assertSafeText(JSON.stringify(candidate.metadata), 'proposal metadata');
  const known = loadKnowledge(root);
  if (known.byId.has(candidate.metadata.id)) fail(`Knowledge identifier already exists: ${candidate.metadata.id}`);
  for (const source of candidate.metadata.provenance.source_files) {
    const file = assertSafeRepoPath(root, source.path);
    if (sha256(readFileSync(file)) !== source.sha256) fail(`Proposal evidence hash is not current: ${source.path}`);
  }
  for (const reference of candidate.metadata.provenance.evidence) {
    assertSafeText(reference.ref, 'proposal evidence reference');
    if (['file', 'test'].includes(reference.kind)) {
      const file = assertSafeRepoPath(root, reference.ref);
      const source = readFileSync(file);
      if (reference.sha256 && sha256(source) !== reference.sha256) fail(`Proposal evidence hash is not current: ${reference.ref}`);
    }
  }
  const ids = new Set(known.records.map(({ metadata }) => metadata.id));
  for (const values of Object.values(candidate.metadata.relationships)) {
    for (const id of values) if (!ids.has(id)) fail(`Proposal relationship references unknown knowledge: ${id}`);
  }
  return known;
}

export function proposeKnowledge(root, { session, task, findingId, candidate }) {
  verifySession(root, session, task);
  if (typeof findingId !== 'string' || !/^finding-[a-f0-9]{24}$/.test(findingId)) fail('Invalid finding identifier');
  if (!candidate || typeof candidate !== 'object' || typeof candidate.body !== 'string') fail('Knowledge proposal must include a record and Markdown body');
  const known = proposalRecord(root, candidate);
  const document = {
    schema_version: 1,
    findingId,
    record: candidate,
    approval: 'Required through existing Git review; this command never promotes or edits authoritative records.',
    createdAt: new Date().toISOString(),
    relatedRecords: known.records.filter(({ metadata }) =>
      metadata.title.toLocaleLowerCase('en') === candidate.metadata.title.toLocaleLowerCase('en'))
      .map(({ metadata }) => metadata.id),
  };
  const id = `proposal-${digest({ findingId, candidate }).slice(0, 24)}`;
  const db = openKnowledgeStore(root);
  let persistedDocument = document;
  try {
    const finding = db.prepare('SELECT id FROM findings WHERE id = ?').get(findingId);
    if (!finding) fail(`Provisional finding not found: ${findingId}`);
    const existing = db.prepare('SELECT document_json FROM proposals WHERE id = ?').get(id);
    if (existing) persistedDocument = JSON.parse(existing.document_json);
    db.prepare(`
      INSERT OR IGNORE INTO proposals (id, finding_id, created_at, status, document_json)
      VALUES (?, ?, ?, 'pending-review', ?)
    `).run(id, findingId, persistedDocument.createdAt, JSON.stringify(persistedDocument));
  } finally { closeKnowledgeStore(db); }
  const artifact = `.artifacts/knowledge/proposals/${id}.json`;
  const artifactFile = safePath(root, artifact);
  const artifactDocument = { id, status: 'pending-review', ...persistedDocument };
  if (existsSync(artifactFile)) {
    if (canonical(readJson(artifactFile)) !== canonical(artifactDocument)) fail('Existing proposal artifact does not match stored proposal');
  } else writeJson(root, artifact, artifactDocument, true);
  return { id, status: 'pending-review', artifact, approval: persistedDocument.approval, relatedRecords: persistedDocument.relatedRecords };
}

function checkpointText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`Checkpoint ${label} must be a non-empty string`);
  assertSafeText(value, `checkpoint ${label}`);
  return value.trim();
}

function validateCheckpointPayload(root, payload) {
  const listKeys = ['completed', 'remaining', 'decisions', 'findings', 'files', 'validations', 'blockers', 'next_actions'];
  for (const key of listKeys) {
    if (!Array.isArray(payload[key])) fail(`Checkpoint ${key} must be an array`);
    for (const entry of payload[key]) {
      if (typeof entry === 'string') assertSafeText(entry, `checkpoint ${key}`);
    }
  }
  for (const file of payload.files) assertSafeRepoPath(root, file);
}

export function createCheckpoint(root, { session, task, checkpoint }) {
  const { receipt } = verifySession(root, session, task);
  assertSafeText(task, 'checkpoint task');
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) fail('Checkpoint payload must be an object');
  validateCheckpointPayload(root, checkpoint);
  const repository = readJson(safePath(root, 'package.json')).name;
  const timestamp = new Date().toISOString();
  const id = `checkpoint-${createHash('sha256').update(`${session}:${timestamp}:${randomUUID()}`).digest('hex').slice(0, 24)}`;
  const document = {
    schema_version: 1,
    id,
    session_id: session,
    task_fingerprint: receipt.taskFingerprint,
    task,
    repository,
    commit: currentCommit(root),
    objective: checkpointText(checkpoint.objective, 'objective'),
    completed: checkpoint.completed,
    remaining: checkpoint.remaining,
    decisions: checkpoint.decisions,
    findings: checkpoint.findings,
    files: checkpoint.files,
    validations: checkpoint.validations,
    blockers: checkpoint.blockers,
    next_actions: checkpoint.next_actions,
    created_at: timestamp,
  };
  validate(root, checkpointSchema, document);
  const db = openKnowledgeStore(root);
  try {
    for (const findingId of document.findings) {
      if (!db.prepare('SELECT id FROM findings WHERE id = ?').get(findingId)) fail(`Checkpoint finding not found: ${findingId}`);
    }
    db.prepare(`
      INSERT INTO checkpoints (id, session_id, task_fingerprint, created_at, document_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, session, receipt.taskFingerprint, timestamp, JSON.stringify(document));
  } finally { closeKnowledgeStore(db); }
  return document;
}

export function restoreCheckpoint(root, { session, task, id }) {
  const { receipt } = verifySession(root, session, task);
  const db = openKnowledgeStore(root);
  try {
    const row = id
      ? db.prepare('SELECT document_json FROM checkpoints WHERE id = ? AND task_fingerprint = ?').get(id, receipt.taskFingerprint)
      : db.prepare('SELECT document_json FROM checkpoints WHERE task_fingerprint = ? ORDER BY created_at DESC LIMIT 1').get(receipt.taskFingerprint);
    if (!row) fail(id ? 'Checkpoint not found for the verified task' : 'No checkpoint found for the verified task');
    const checkpoint = JSON.parse(row.document_json);
    validate(root, checkpointSchema, checkpoint);
    return {
      checkpoint,
      restoredIntoSession: session,
      authorization: 'context-only; current discovery receipt remains authoritative',
    };
  } finally { closeKnowledgeStore(db); }
}

export function summarizeCheckpoints(root, { session, task, limit = 10 }) {
  const { receipt } = verifySession(root, session, task);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('Checkpoint summary limit must be from 1 to 100');
  const db = openKnowledgeStore(root);
  try {
    const rows = db.prepare(`
      SELECT document_json FROM checkpoints
      WHERE task_fingerprint = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(receipt.taskFingerprint, limit);
    const checkpoints = rows.map(({ document_json: json }) => JSON.parse(json));
    return {
      taskFingerprint: receipt.taskFingerprint,
      chronology: checkpoints.map(({ id, created_at, objective, completed, decisions, blockers, remaining, next_actions }) =>
        ({ id, created_at, objective, completed, decisions, blockers, remaining, next_actions })),
      compacted: checkpoints.length > 0,
      summarization: 'deterministic chronology; no LLM compaction was used',
    };
  } finally { closeKnowledgeStore(db); }
}

export function getFinding(root, id) {
  const db = openKnowledgeStore(root);
  try {
    const finding = db.prepare('SELECT * FROM findings WHERE id = ?').get(id);
    if (!finding) fail(`Provisional finding not found: ${id}`);
    const sessions = db.prepare(`
      SELECT session_id, task_fingerprint, commit_sha, captured_at, source_refs_json
      FROM finding_sessions WHERE finding_id = ? ORDER BY captured_at
    `).all(id);
    return {
      id: finding.id,
      status: 'provisional',
      classification: finding.classification,
      title: finding.title,
      details: finding.details,
      sourceReferences: sessions.flatMap(({ source_refs_json: refs }) => JSON.parse(refs)),
      relatedKnowledge: JSON.parse(finding.related_knowledge_json),
      sessions: sessions.map(({ source_refs_json, ...session }) => session),
      createdAt: finding.created_at,
    };
  } finally { closeKnowledgeStore(db); }
}

export function currentFindingFingerprint(finding) {
  return digest(finding);
}
