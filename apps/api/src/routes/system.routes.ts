import type { FastifyInstance } from 'fastify';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';
import type { Scheduler } from '../jobs/scheduler.js';
import { runHolderSnapshot } from '../jobs/snapshot-holders.job.js';
import { runMarketSnapshot } from '../jobs/snapshot-market.job.js';
import { runMarketSlippage, runScanDiscover, runScanEvaluate, runScanRetro, runWatchNews, runWatchOnchain, runWatchPages, runWatchReview } from '../jobs/watch.jobs.js';

export function systemRoutes(app: FastifyInstance, s: Services, scheduler: Scheduler | null, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;

  app.get('/health', async () => ({ ok: true, tier: s.ctx.sources.tier, ts: Date.now() }));

  app.get('/system/sources', async () => envelope(h, s.ctx.sources.sourcesView()));

  app.get('/system/usage', async () => envelope(h, await s.system.usage()));

  app.post('/system/jobs/:name/run', expensive, async (req, reply) => {
    const name = (req.params as { name: string }).name;
    if (!scheduler) return reply.status(409).send({ error: 'Jobs désactivés (JOBS_ENABLED=false)', code: 'jobs_disabled' });
    if (name === 'market-snapshot') await scheduler.run(name, runMarketSnapshot);
    else if (name === 'holder-snapshot') await scheduler.run(name, (svc) => runHolderSnapshot(svc));
    else if (name === 'watch-pages') await scheduler.run(name, runWatchPages);
    else if (name === 'watch-news') await scheduler.run(name, runWatchNews);
    else if (name === 'watch-onchain') await scheduler.run(name, runWatchOnchain);
    else if (name === 'watch-review') await scheduler.run(name, runWatchReview);
    else if (name === 'market-slippage') await scheduler.run(name, runMarketSlippage);
    else if (name === 'scan-discover') await scheduler.run(name, runScanDiscover);
    else if (name === 'scan-evaluate') await scheduler.run(name, runScanEvaluate);
    else if (name === 'scan-retro') await scheduler.run(name, runScanRetro);
    else return reply.status(404).send({ error: `Job inconnu : ${name}`, code: 'not_found' });
    return envelope(h, { ran: name });
  });
}
