import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema';
import { seedIfEmpty } from './seed';

export type Row = Record<string, unknown>;

export interface Stmt {
  all(...params: unknown[]): Row[];
  get(...params: unknown[]): Row | undefined;
  run(...params: unknown[]): { changes: number };
}

export interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  transaction<T>(fn: () => T): T;
  close(): void;
  driver: 'better-sqlite3' | 'node:sqlite';
}

/** node:sqlite only accepts null, number, bigint, string and Uint8Array. */
function normalize(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

type NodeSqliteStmt = {
  all(...params: unknown[]): Row[];
  get(...params: unknown[]): Row | undefined;
  run(...params: unknown[]): { changes: number | bigint };
};

/**
 * node:sqlite returns rows with a null prototype, so String()/template literals
 * throw "Cannot convert object to primitive value". Copying each row into a plain
 * object restores Object.prototype and matches the better-sqlite3 driver.
 */
function plainRow<T>(row: T): T {
  if (row && typeof row === 'object') return { ...(row as Record<string, unknown>) } as T;
  return row;
}

function wrapNodeSqlite(db: {
  exec(sql: string): void;
  prepare(sql: string): NodeSqliteStmt;
  close(): void;
}): SqlDb {
  let depth = 0;
  return {
    driver: 'node:sqlite',
    exec: (sql) => db.exec(sql),
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        all: (...params) => stmt.all(...normalize(params)).map((row) => plainRow(row)),
        get: (...params) => plainRow(stmt.get(...normalize(params))),
        run: (...params) => {
          const res = stmt.run(...normalize(params));
          return { changes: Number(res.changes) };
        },
      };
    },
    transaction<T>(fn: () => T): T {
      if (depth > 0) return fn();
      depth += 1;
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* already rolled back */
        }
        throw err;
      } finally {
        depth -= 1;
      }
    },
    close: () => db.close(),
  };
}

type BetterSqliteStmt = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number };
};

function wrapBetterSqlite(db: {
  exec(sql: string): void;
  prepare(sql: string): BetterSqliteStmt;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}): SqlDb {
  return {
    driver: 'better-sqlite3',
    exec: (sql) => db.exec(sql),
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        all: (...params) => stmt.all(...normalize(params)) as Row[],
        get: (...params) => stmt.get(...normalize(params)) as Row | undefined,
        run: (...params) => stmt.run(...normalize(params)),
      };
    },
    transaction: (fn) => db.transaction(fn)(),
    close: () => db.close(),
  };
}

type NodeSqliteModule = {
  DatabaseSync: new (file: string) => Parameters<typeof wrapNodeSqlite>[0];
};

/**
 * Resolve the built-in node:sqlite module without a static `require('node:sqlite')`.
 * The bundler rewrites that specifier into an external URL reference inside the
 * server chunk, which then fails at runtime with "Unsupported external type Url".
 * process.getBuiltinModule is resolved at runtime and is left untouched.
 */
function loadNodeSqlite(): NodeSqliteModule | null {
  const host = process as unknown as { getBuiltinModule?: (id: string) => unknown };
  if (typeof host.getBuiltinModule !== 'function') return null;
  try {
    const mod = host.getBuiltinModule('node:sqlite') as NodeSqliteModule | undefined;
    if (mod && typeof mod.DatabaseSync === 'function') return mod;
  } catch {
    /* this Node build has no sqlite support */
  }
  return null;
}

function open(file: string): SqlDb {
  const errors: string[] = [];

  // 1. Native better-sqlite3 when its binary matches this Node ABI.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('better-sqlite3');
    const Better = (mod.default ?? mod) as new (f: string) => Parameters<typeof wrapBetterSqlite>[0];
    const db = new Better(file);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    return wrapBetterSqlite(db);
  } catch (err) {
    errors.push(`better-sqlite3: ${(err as Error).message}`);
  }

  // 2. Built-in node:sqlite (Node 22.5+), used by the production runtime.
  try {
    const mod = loadNodeSqlite();
    if (!mod) throw new Error('node:sqlite is not available in this Node build');
    const db = new mod.DatabaseSync(file) as Parameters<typeof wrapNodeSqlite>[0];
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    return wrapNodeSqlite(db);
  } catch (err) {
    errors.push(`node:sqlite: ${(err as Error).message}`);
  }

  throw new Error(`No SQLite driver available in this runtime. ${errors.join(' | ')}`);
}

const globalForDb = globalThis as unknown as { __spacepilotDb?: SqlDb };

export function getDb(): SqlDb {
  if (globalForDb.__spacepilotDb) return globalForDb.__spacepilotDb;
  const dir = process.env.DATA_DIR || path.join(process.cwd(), '.data');
  fs.mkdirSync(dir, { recursive: true });
  const db = open(path.join(dir, 'spacepilot.db'));
  db.exec(SCHEMA);
  seedIfEmpty(db);
  globalForDb.__spacepilotDb = db;
  return db;
}

export function total(sql: string, params: unknown[] = []): number {
  const row = one<Record<string, unknown>>(sql, params);
  if (!row) return 0;
  return Number(Object.values(row)[0] ?? 0);
}

export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): { changes: number } {
  return getDb().prepare(sql).run(...params);
}

/** Serialised write transaction (BEGIN IMMEDIATE) used by the booking engine. */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn);
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
