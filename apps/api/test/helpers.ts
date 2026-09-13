import { loadEnv } from '../src/config/env.js';
import { openDatabase } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';
import { buildServices } from '../src/services/index.js';

export function testServices() {
  const env = loadEnv({ DATABASE_PATH: ':memory:', JOBS_ENABLED: 'false', SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com' });
  const db = openDatabase(':memory:');
  migrate(db);
  const log = { info() {}, warn() {}, error() {}, debug() {} };
  const services = buildServices(env, db, log);
  return { db, services, env };
}

export function insertToken(db: ReturnType<typeof testServices>['db'], address = 'So11111111111111111111111111111111111111112'): number {
  const r = db
    .prepare(`INSERT INTO tokens (address, symbol, name, decimals, program, created_at, added_at) VALUES (?, 'TST', 'Test', 6, 'spl-token', ?, ?)`)
    .run(address, Math.floor(Date.now() / 1000) - 90 * 86400, Math.floor(Date.now() / 1000));
  return Number(r.lastInsertRowid);
}
