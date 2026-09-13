import { CreateAlertInput, UpdateAlertInput } from '@tpm/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const ListQuery = z.object({ tokenId: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });

export function alertsRoutes(app: FastifyInstance, s: Services, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;

  app.get('/alerts', async (req) => {
    const { tokenId } = ListQuery.parse(req.query);
    return envelope(h, s.alerts.list(tokenId));
  });

  app.post('/alerts', async (req, reply) => {
    const input = CreateAlertInput.parse(req.body);
    return reply.status(201).send(envelope(h, s.alerts.create(input)));
  });

  app.patch('/alerts/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    const patch = UpdateAlertInput.parse(req.body);
    return envelope(h, s.alerts.update(id, patch));
  });

  app.delete('/alerts/:id', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    s.alerts.delete(id);
    return reply.status(204).send();
  });

  app.get('/alerts/events', async (req) => {
    const { tokenId, limit } = ListQuery.parse(req.query);
    return envelope(h, s.ctx.alerts.events(limit, tokenId));
  });

  app.post('/alerts/events/:id/ack', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, { acknowledged: s.ctx.alerts.acknowledge(id) });
  });

  app.post('/alerts/test', expensive, async () => {
    return envelope(h, await s.alerts.sendTest());
  });

  app.post('/alerts/evaluate', expensive, async () => {
    return envelope(h, await s.alerts.evaluateAll());
  });
}
