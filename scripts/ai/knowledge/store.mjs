import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { safePath, fail } from '../core.mjs';

const databasePath = '.artifacts/knowledge/working.sqlite';
const schemaVersion = 2;
const require = createRequire(import.meta.url);

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > schemaVersion) fail(`Knowledge database schema ${current} is newer than supported schema ${schemaVersion}`);
  if (current === schemaVersion) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (current === 0) {
      db.exec(`
        CREATE TABLE findings (
          id TEXT PRIMARY KEY,
          fingerprint TEXT NOT NULL UNIQUE,
          classification TEXT NOT NULL,
          title TEXT NOT NULL,
          details TEXT NOT NULL,
          source_refs_json TEXT NOT NULL,
          related_knowledge_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE finding_sessions (
          finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
          session_id TEXT NOT NULL,
          task_fingerprint TEXT NOT NULL,
          commit_sha TEXT,
          captured_at TEXT NOT NULL,
          source_refs_json TEXT NOT NULL,
          PRIMARY KEY (finding_id, session_id)
        );
        CREATE TABLE checkpoints (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          task_fingerprint TEXT NOT NULL,
          created_at TEXT NOT NULL,
          document_json TEXT NOT NULL
        );
        CREATE INDEX checkpoints_task_created ON checkpoints(task_fingerprint, created_at DESC);
        CREATE TABLE proposals (
          id TEXT PRIMARY KEY,
          finding_id TEXT NOT NULL REFERENCES findings(id),
          created_at TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status = 'pending-review'),
          document_json TEXT NOT NULL
        );
        CREATE TABLE knowledge_index (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          effective_status TEXT NOT NULL,
          source_paths_json TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE knowledge_fts USING fts5(
          id UNINDEXED, path, title, body, tags, tokenize='unicode61'
        );
        CREATE TABLE knowledge_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
    }
    if (current < 2) {
      db.exec(`
        CREATE TABLE knowledge_embeddings (
          record_id TEXT NOT NULL,
          model TEXT NOT NULL,
          version TEXT NOT NULL,
          dimensions INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          vector_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (record_id, model, version)
        );
        CREATE INDEX knowledge_embeddings_model ON knowledge_embeddings(model, version);
        PRAGMA user_version = 2;
      `);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function openKnowledgeStore(root) {
  const file = safePath(root, databasePath);
  mkdirSync(path.dirname(file), { recursive: true });
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    const integrity = db.prepare('PRAGMA quick_check').get().quick_check;
    if (integrity !== 'ok') fail(`Knowledge database integrity check failed: ${integrity}`);
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function closeKnowledgeStore(db) {
  db.close();
}

export function knowledgeStoreStatus(root) {
  const db = openKnowledgeStore(root);
  try {
    const findings = db.prepare('SELECT count(*) AS count FROM findings').get().count;
    const checkpoints = db.prepare('SELECT count(*) AS count FROM checkpoints').get().count;
    const proposals = db.prepare('SELECT count(*) AS count FROM proposals').get().count;
    const index = db.prepare("SELECT value FROM knowledge_state WHERE key = 'snapshot'").get();
    return {
      schemaVersion: db.prepare('PRAGMA user_version').get().user_version,
      findings,
      checkpoints,
      proposals,
      indexedSnapshot: index?.value ?? null,
    };
  } finally { closeKnowledgeStore(db); }
}
