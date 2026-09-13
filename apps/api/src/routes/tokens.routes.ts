import { AddTokenInput, ReorderInput } from '@tpm/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });

export function tokensRoutes(app: FastifyInstance, s: Services, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;

  app.get('/tokens', async () => {
    const items = s.tokens.list();
    return envelope(h, items, { source: 'local' });
  });

  app.post('/tokens', expensive, async (req, reply) => {
    const body = AddTokenInput.parse(req.body);
    const token = await s.tokens.add(body.address);
    s.alerts.ensureDivergenceAlerts(token.id);
    // Premiers snapshots immédiats, sans bloquer la réponse.
    setImmediate(() => {
      void s.market.snapshot(token.id).catch((e) => s.ctx.log.warn({ err: e.message }, 'snapshot marché initial'));
      void s.holders.snapshot(token.id).catch((e) => s.ctx.log.warn({ err: e.message }, 'snapshot détenteurs initial'));
      void s.health.get(token.id).catch((e) => s.ctx.log.warn({ err: e.message }, 'santé initiale'));
    });
    return reply.status(201).send(envelope(h, token, { source: 'rpc' }));
  });

  app.delete('/tokens/:id', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    s.tokens.remove(id);
    return reply.status(204).send();
  });

  app.patch('/tokens/order', async (req) => {
    const { ids } = ReorderInput.parse(req.body);
    s.tokens.reorder(ids);
    return envelope(h, s.tokens.list());
  });
}
