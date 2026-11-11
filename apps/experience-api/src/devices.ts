import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');

export function openDefaultDeviceStore(): DeviceStore {
  const directory = join(homedir(), '.household-streaming');
  try {
    mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Device database directory must be a real directory');
  }
  return new DeviceStore(join(directory, 'devices.sqlite'));
}

export class DeviceStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (!isAbsolute(file)) throw new Error('Device database path must be absolute');
    if (process.platform !== 'win32') {
      const directory = lstatSync(dirname(file));
      const uid = process.getuid?.();
      if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== uid || (directory.mode & 0o077) !== 0) {
        throw new Error('Device database directory must be private and owned by the service user');
      }
      let fd: number;
      try {
        fd = openSync(file, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        fd = openSync(file, constants.O_RDWR | constants.O_NOFOLLOW);
      }
      try {
        const info = fstatSync(fd);
        if (!info.isFile() || info.uid !== uid || (info.mode & 0o077) !== 0 || info.nlink !== 1) {
          throw new Error('Device database must be a private, singly-linked file owned by the service user');
        }
      } finally {
        closeSync(fd);
      }
    }
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS pairing_codes (digest TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, digest TEXT NOT NULL UNIQUE, revoked INTEGER NOT NULL DEFAULT 0);`);
  }

  createPairingCode(now = Date.now()): string {
    const code = secret();
    this.db.prepare('DELETE FROM pairing_codes WHERE expires <= ?').run(now);
    this.db.prepare('INSERT INTO pairing_codes VALUES (?, ?)').run(hash(code), now + 5 * 60_000);
    return code;
  }

  pair(code: string, now = Date.now()): { deviceId: string; credential: string } | null {
    const credential = secret();
    const deviceId = randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = this.db.prepare('DELETE FROM pairing_codes WHERE digest = ? AND expires > ?').run(hash(code), now);
      if (result.changes !== 1) {
        this.db.exec('ROLLBACK');
        return null;
      }
      this.db.prepare('INSERT INTO devices (id, digest) VALUES (?, ?)').run(deviceId, hash(credential));
      this.db.exec('COMMIT');
      return { deviceId, credential };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  authorize(credential: string): boolean {
    return this.db.prepare('SELECT id FROM devices WHERE digest = ? AND revoked = 0').get(hash(credential)) !== undefined;
  }

  revoke(id: string): boolean {
    return this.db.prepare('UPDATE devices SET revoked = 1 WHERE id = ? AND revoked = 0').run(id).changes === 1;
  }

  close(): void {
    this.db.close();
  }
}
