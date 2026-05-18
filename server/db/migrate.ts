import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, closeDb, type Db } from './connect.js';
import { getConfig } from '../config/getConfig.js';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export function migrate(db: Db, migrationsDir = path.resolve(process.cwd(), 'migrations')): MigrationResult {
  db.exec(MIGRATION_TABLE_SQL);

  const files = listMigrationFiles(migrationsDir);
  const appliedRows = db
    .prepare<[], { version: string }>('SELECT version FROM schema_migrations')
    .all();
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (appliedVersions.has(file)) {
      result.skipped.push(file);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    })();
    appliedVersions.add(file);
    result.applied.push(file);
  }

  return result;
}

function listMigrationFiles(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const config = getConfig();
  const db = connect(config.databasePath);
  try {
    const result = migrate(db);
    console.log(
      `[migrate] applied=${result.applied.length} skipped=${result.skipped.length}`
    );
    if (result.applied.length > 0) {
      console.log(`[migrate] ${result.applied.join(', ')}`);
    }
  } finally {
    closeDb(db);
  }
}
