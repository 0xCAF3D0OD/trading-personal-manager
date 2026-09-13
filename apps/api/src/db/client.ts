import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Chargé via getBuiltinModule : `node:sqlite` n'accepte que le préfixe node:, ce que
// certains bundlers (vite-node) ne résolvent pas. Même module, même API.
const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
const { DatabaseSync } = sqlite;

export type Db = import('node:sqlite').DatabaseSync;

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

export function nowS(): number {
  return Math.floor(Date.now() / 1000);
}

export function dayOf(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
