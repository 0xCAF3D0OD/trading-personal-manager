import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const DaysQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(1) });
const IdParam = z.object({ id: z.coerce.number().int().positive() });

export function scannerRoutes(app: FastifyInstance, s: Services, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;
  app.get('/scanner/overview', async () => envelope(h, s.scanner.overview()));
  app.get('/scanner/results', async (req) => { const { days } = DaysQuery.parse(req.query); return envelope(h, s.scanner.results(days), { source: 'geckoterminal' }); });
  app.get('/scanner/results/run/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    const watch = new Set(s.ctx.tokens.listActive().map((t) => t.address));
    return envelope(h, { kept: s.ctx.scanner.results(id, 'kept', watch), excluded: s.ctx.scanner.results(id, 'excluded', watch) }, { source: 'geckoterminal' });
  });
  app.get('/scanner/excluded', async (req) => { const { days } = z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }).parse(req.query); return envelope(h, s.scanner.excluded(days), { source: 'geckoterminal' }); });
  app.get('/scanner/runs', async () => envelope(h, s.scanner.runs()));
  app.get('/scanner/retro', async () => envelope(h, s.scanner.retroView()));
  /** Lancement manuel : découverte puis évaluation. Rate-limité : chaque passage consomme des appels. */
  app.post('/scanner/run', expensive, async () => {
    const d = await s.scanner.discover();
    const e = await s.scanner.evaluate();
    return envelope(h, { discover: d, evaluate: e });
  });
  app.post('/scanner/retro/run', expensive, async () => envelope(h, { filled: await s.scanner.retro() }));
}
