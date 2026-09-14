import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const ModuleParam = z.object({ module: z.enum(['watch', 'market', 'scanner', 'ui']) });
const UpdateInput = z.object({ settings: z.unknown(), note: z.string().max(200).optional().nullable() });

export function settingsRoutes(app: FastifyInstance, s: Services): void {
  const h = s.ctx.sources.health;
  app.get('/settings/:module', async (req) => {
    const { module } = ModuleParam.parse(req.params);
    return envelope(h, s.settings.envelope(module));
  });
  app.put('/settings/:module', async (req) => {
    const { module } = ModuleParam.parse(req.params);
    const { settings, note } = UpdateInput.parse(req.body);
    return envelope(h, s.settings.update(module, settings, note ?? null));
  });
  app.post('/settings/:module/reset', async (req) => {
    const { module } = ModuleParam.parse(req.params);
    return envelope(h, s.settings.reset(module));
  });
}
