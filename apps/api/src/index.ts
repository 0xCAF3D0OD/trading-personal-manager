import { loadEnv } from './config/env.js';
import { openDatabase } from './db/client.js';
import { migrate } from './db/migrate.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = openDatabase(env.DATABASE_PATH);
  const ran = migrate(db);
  const { app, scheduler, services } = await buildApp(env, db);
  if (ran.length) app.log.info({ migrations: ran }, 'Migrations appliquées');
  app.log.info({
    tier: services.ctx.sources.tier,
    helius: !!services.ctx.sources.helius,
    solscan: !!services.ctx.sources.solscan,
    notifiers: services.alerts['hub'].channels,
  }, 'Sources configurées');

  await app.listen({ port: env.PORT, host: env.HOST });
  scheduler?.start();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Arrêt');
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
