import { PlanInput } from '@tpm/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });

export function plansRoutes(app: FastifyInstance, s: Services): void {
  const h = s.ctx.sources.health;

  app.get('/tokens/:id/plans', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.plans.list(id));
  });

  /** Toujours une nouvelle version. Pas de PUT, pas de DELETE : les plans sont immuables. */
  app.post('/tokens/:id/plans', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const input = PlanInput.parse(req.body);
    const plan = s.plans.create(id, input);
    return reply.status(201).send(envelope(h, plan));
  });
}
