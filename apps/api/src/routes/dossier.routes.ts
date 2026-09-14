import { CreateAiReportInput } from '@tpm/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const DossierQuery = z.object({ format: z.enum(['md', 'json']).default('json'), plan: z.enum(['0', '1']).optional() });

/** Dossier pour l'IA et rapports figés (docs/05, partie B). Lecture, et insertion de rapports : jamais de modification. */
export function dossierRoutes(app: FastifyInstance, s: Services, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;

  app.get('/tokens/:id/dossier', expensive, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { format, plan } = DossierQuery.parse(req.query);
    const view = await s.dossier.get(id, plan === undefined ? {} : { includePlan: plan === '1' });
    if (format === 'md') return reply.type('text/markdown; charset=utf-8').send(view.markdown);
    return envelope(h, view);
  });

  app.get('/tokens/:id/reports', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.reports.list(id));
  });

  app.post('/tokens/:id/reports', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const input = CreateAiReportInput.parse(req.body);
    reply.code(201);
    return envelope(h, await s.reports.create(id, input));
  });
}
