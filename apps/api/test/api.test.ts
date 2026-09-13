import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type BuiltApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { openDatabase } from '../src/db/client.js';
import { migrate } from '../src/db/migrate.js';

describe('API', () => {
  let built: BuiltApp;
  beforeAll(async () => {
    const env = loadEnv({ DATABASE_PATH: ':memory:', JOBS_ENABLED: 'false' });
    const db = openDatabase(':memory:');
    migrate(db);
    built = await buildApp(env, db, { logger: false });
  });
  afterAll(async () => built.app.close());

  it('répond sur /api/health et /api/system/sources', async () => {
    const h = await built.app.inject({ method: 'GET', url: '/api/health' });
    expect(h.statusCode).toBe(200);
    const s = await built.app.inject({ method: 'GET', url: '/api/system/sources' });
    expect(s.statusCode).toBe(200);
    expect(s.json().data.tier).toBe('A');
  });

  it('refuse une adresse invalide avant tout appel réseau', async () => {
    const r = await built.app.inject({ method: 'POST', url: '/api/tokens', payload: { address: 'pas-une-adresse-valide-du-tout-1234567890' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('validation');
  });

  it('refuse un plan sans confirmation de perte totale', async () => {
    const r = await built.app.inject({ method: 'POST', url: '/api/tokens/1/plans', payload: { entryPrice: 1, takeProfitPrice: 2, stopLossPrice: 0.5, amountUsd: 10, acceptsTotalLoss: false } });
    expect(r.statusCode).toBe(400);
  });
});
