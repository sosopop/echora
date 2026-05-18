import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

export function connect(databasePath: string): Db {
  if (databasePath !== ':memory:') {
    const dir = path.dirname(databasePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function closeDb(db: Db): void {
  if (db.open) {
    db.close();
  }
}
