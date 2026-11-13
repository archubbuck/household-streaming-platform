import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import { canonical, digest, fail, readJson, safePath, sha256 } from '../core.mjs';

const catalogPath = 'knowledge/catalog.json';
const recordSchemaPath = '.agents/schemas/knowledge-record.schema.json';
const catalogSchemaPath = '.agents/schemas/knowledge-catalog.schema.json';
const sensitiveSegment = /(^|\/)(?:\.env(?:\..*)?|\.artifacts|node_modules|\.git|secrets?|credentials?|private[-_]?keys?|tokens?|keys?|id_rsa|id_ed25519|[^/]*(?:secret|credential|private[-_]?key|token|keypair)[^/]*)(\/|$)/i;
const secretAssignment = /\b(?:api[_-]?key|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[A-Za-z0-9/+=_.-]{12,}/i;
const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i;
const emailAddress = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function compileSchema(root, relative) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  return ajv.compile(readJson(safePath(root, relative)));
}

function validate(root, relative, document) {
  const check = compileSchema(root, relative);
  if (!check(document)) fail(`Knowledge schema validation failed (${relative}): ${new Ajv({ allErrors: true }).errorsText(check.errors)}`);
}

function isSensitivePath(relative) {
  return sensitiveSegment.test(relative.replaceAll('\\', '/'));
}

function rejectSensitiveText(value, label) {
  if (secretAssignment.test(value) || privateKey.test(value) || bearerToken.test(value) || emailAddress.test(value)) {
    fail(`Potential secret or personal data rejected in ${label}`);
  }
}

function parseRecord(root, relative) {
  const markdown = readFileSync(safePath(root, relative), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);
  if (!match) fail(`Knowledge record must use JSON-compatible YAML front matter: ${relative}`);
  let metadata;
  try { metadata = JSON.parse(match[1]); }
  catch { fail(`Invalid JSON-compatible YAML front matter: ${relative}`); }
  validate(root, recordSchemaPath, metadata);
  rejectSensitiveText(match[2], relative);
  return { metadata, body: match[2].trim(), path: relative };
}

export function knowledgeContentHash(metadata, body) {
  const copy = JSON.parse(JSON.stringify(metadata));
  copy.verification.content_hash = null;
  return digest({ metadata: copy, body });
}

export function loadKnowledge(root) {
  const catalog = readJson(safePath(root, catalogPath));
  validate(root, catalogSchemaPath, catalog);
  const ids = new Set();
  const paths = new Set();
  const records = catalog.records.map(({ id, path: relative }) => {
    if (ids.has(id)) fail(`Duplicate knowledge identifier: ${id}`);
    if (paths.has(relative)) fail(`Knowledge path is assigned more than once: ${relative}`);
    ids.add(id);
    paths.add(relative);
    if (isSensitivePath(relative)) fail(`Sensitive knowledge path rejected: ${relative}`);
    const record = parseRecord(root, relative);
    if (record.metadata.id !== id) fail(`Catalog identifier mismatch: ${id}`);
    return record;
  });
  const byId = new Map(records.map((record) => [record.metadata.id, record]));
  for (const record of records) {
    for (const [kind, relatedIds] of Object.entries(record.metadata.relationships)) {
      for (const relatedId of relatedIds) {
        if (!byId.has(relatedId)) fail(`Unknown ${kind} knowledge reference: ${record.metadata.id} -> ${relatedId}`);
        if (relatedId === record.metadata.id && kind !== 'related_to') fail(`Self-referential ${kind} relationship: ${relatedId}`);
      }
    }
    rejectSensitiveText(canonical(record.metadata), record.path);
  }
  const withFreshness = records.map((record) => {
    const changedSources = [];
    const recordContentChanged = record.metadata.status === 'verified' &&
      record.metadata.verification.content_hash !== knowledgeContentHash(record.metadata, record.body);
    for (const source of record.metadata.provenance.source_files) {
      if (isSensitivePath(source.path)) fail(`Sensitive source path rejected: ${source.path}`);
      let currentHash = null;
      try { currentHash = sha256(readFileSync(safePath(root, source.path))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (currentHash !== source.sha256) changedSources.push({ path: source.path, expected: source.sha256, current: currentHash });
    }
    const missingEvidence = record.metadata.provenance.evidence
      .filter(({ kind, ref }) => ['file', 'test'].includes(kind))
      .filter(({ ref }) => {
        if (isSensitivePath(ref)) fail(`Sensitive evidence path rejected: ${ref}`);
        try { return !safePath(root, ref) || !readFileSync(safePath(root, ref)); }
        catch (error) { if (error.code === 'ENOENT') return true; throw error; }
      });
    const stale = record.metadata.status === 'stale' ||
      (record.metadata.status === 'verified' && (recordContentChanged || changedSources.length > 0 || missingEvidence.length > 0));
    return {
      ...record,
      effectiveStatus: stale ? 'stale' : record.metadata.status,
      freshness: { stale, recordContentChanged, changedSources, missingEvidence },
    };
  });
  const snapshot = digest(withFreshness.map(({ metadata, body, path: relative, freshness }) =>
    [metadata, body, relative, freshness]));
  return { catalog, records: withFreshness, byId: new Map(withFreshness.map((record) => [record.metadata.id, record])), snapshot };
}

export function validateKnowledge(root) {
  const knowledge = loadKnowledge(root);
  const staleRecords = knowledge.records
    .filter(({ freshness }) => freshness.stale)
    .map(({ metadata, freshness }) => ({ id: metadata.id, ...freshness }));
  return {
    status: staleRecords.length ? 'stale' : 'passed',
    recordCount: knowledge.records.length,
    staleRecords,
    snapshot: knowledge.snapshot,
  };
}

export function getKnowledgeRecord(root, id) {
  const record = loadKnowledge(root).byId.get(id);
  if (!record) fail(`Knowledge record not found: ${id}`);
  return record;
}

export function sourcePath(root, relative) {
  if (isSensitivePath(relative)) fail(`Sensitive source path rejected: ${relative}`);
  return path.relative(root, safePath(root, relative)).replaceAll(path.sep, '/');
}
