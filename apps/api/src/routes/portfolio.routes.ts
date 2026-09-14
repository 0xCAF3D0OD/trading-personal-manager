import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const DaysQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(90) });

/** Portefeuille Kraken (docs/06, partie D). Lecture seule : aucune route d'écriture vers Kraken n'existe. */
export function portfolioRoutes(app: FastifyInstance, s: Services, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;
  app.get('/portfolio', async () => {
    const v = await s.portfolio.view();
    return envelope(h, v, { source: v.configured ? 'kraken' : 'local', fetchedAt: v.fetchedAt ?? undefined, cached: v.cached });
  });
  app.post('/portfolio/refresh', expensive, async () => {
    const v = await s.portfolio.view(true);
    return envelope(h, v, { source: 'kraken', fetchedAt: v.fetchedAt ?? undefined });
  });
  app.get('/portfolio/history', async (req) => {
    const { days } = DaysQuery.parse(req.query);
    return envelope(h, s.portfolio.history(days), { source: 'local' });
  });
}
