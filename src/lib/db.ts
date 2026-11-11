import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA } from './schema';
import { seedIfEmpty } from './seed';

type DB = Database.Database;

const globalForDb = globalThis as unknown as { __spacepilotDb?: DB };

export function getDb(): DB {
  if (globalForDb.__spacepilotDb) return globalForDb.__spacepilotDb;
  const dir = process.env.DATA_DIR || path.join(process.cwd(), '.data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'spacepilot.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  seedIfEmpty(db);
  globalForDb.__spacepilotDb = db;
  return db;
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...(params as never[]));
}

export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

export function audit(entry: {
  orgId: string | null;
  userId?: string | null;
  actor?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: unknown;
}) {
  run(
    `INSERT INTO audit_logs (id, org_id, user_id, actor, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `aud_${Math.random().toString(36).slice(2, 12)}`,
      entry.orgId,
      entry.userId ?? null,
      entry.actor ?? null,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      new Date().toISOString(),
    ],
  );
}
