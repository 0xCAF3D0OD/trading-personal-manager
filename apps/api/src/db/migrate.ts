import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

export function migrate(db: Db, migrationsDir = join(here, 'migrations')): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Math.floor(Date.now() / 1000));
      db.exec('COMMIT');
      ran.push(file);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${file} échouée : ${(err as Error).message}`);
    }
  }
  return ran;
}
