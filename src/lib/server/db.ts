import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dbPath, getDataDir, rendersDir } from "./paths";

/**
 * SQLite via Node's built-in `node:sqlite` (no native addon to compile).
 * The web app and the render worker each open their own connection; WAL mode
 * and a busy timeout let them share the file safely.
 */

const MIGRATIONS: string[] = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    doc TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    family TEXT,
    duration REAL,
    width INTEGER,
    height INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX assets_project ON assets(project_id);
  CREATE TABLE renders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    format TEXT NOT NULL,
    quality TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    snapshot TEXT NOT NULL,
    output_file TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER
  );
  CREATE INDEX renders_status ON renders(status, created_at);
  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    scene TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE captions (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];

function migrate(db: DatabaseSync) {
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function openDb(file = dbPath()): DatabaseSync {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.mkdirSync(rendersDir(), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

// Survive Next.js dev hot reloads without leaking connections.
const g = globalThis as unknown as { __studioDb?: { file: string; db: DatabaseSync } };

// A hot reload can bring new migrations while the cached connection lives on.
let migratedThisLoad = false;

export function getDb(): DatabaseSync {
  const file = dbPath();
  if (!g.__studioDb || g.__studioDb.file !== file) {
    g.__studioDb?.db.close();
    g.__studioDb = { file, db: openDb(file) };
  } else if (!migratedThisLoad) {
    migrate(g.__studioDb.db);
  }
  migratedThisLoad = true;
  return g.__studioDb.db;
}

export function closeDb() {
  g.__studioDb?.db.close();
  g.__studioDb = undefined;
}

export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
