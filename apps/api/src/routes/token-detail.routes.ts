import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nowS } from '../db/client.js';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const RangeQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export function tokenDetailRoutes(app: FastifyInstance, s: Services, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;

  app.get('/tokens/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    const item = s.tokens.list().find((t) => t.id === id) ?? null;
    if (!item) {
      const row = s.tokens.require(id);
      return envelope(h, row);
    }
    return envelope(h, item);
  });

  app.get('/tokens/:id/health', async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await s.health.get(id);
    return envelope(h, r.value, { source: r.source, fetchedAt: r.fetchedAt, cached: r.cached });
  });

  app.post('/tokens/:id/health/refresh', expensive, async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await s.health.get(id, true);
    return envelope(h, r.value, { source: r.source, fetchedAt: r.fetchedAt, cached: false });
  });

  app.get('/tokens/:id/market', async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await s.market.getView(id);
    return envelope(h, r.value, { source: r.value.source, fetchedAt: r.value.fetchedAt, cached: r.cached });
  });

  app.get('/tokens/:id/supply', async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await s.supply.getView(id);
    return envelope(h, r.value, { source: 'rpc', fetchedAt: r.value.current.fetchedAt, cached: r.cached });
  });

  app.get('/tokens/:id/holders', async (req) => {
    const { id } = IdParam.parse(req.params);
    const v = s.holders.getView(id);
    return envelope(h, v, { source: v.latest?.source ?? 'local', fetchedAt: v.latest?.ts ?? nowS(), cached: true });
  });

  app.post('/tokens/:id/holders/refresh', expensive, async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await s.holders.snapshot(id, { force: true });
    const v = s.holders.getView(id);
    return envelope(h, { ...v, refresh: r }, { source: v.latest?.source ?? 'local', fetchedAt: v.latest?.ts ?? nowS(), cached: false });
  });

  app.get('/tokens/:id/divergences', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.divergences.compute(id), { source: 'local' });
  });

  app.get('/tokens/:id/history', async (req) => {
    const { id } = IdParam.parse(req.params);
    const { days } = RangeQuery.parse(req.query);
    s.tokens.require(id);
    const since = nowS() - days * 86400;
    return envelope(h, {
      market: s.ctx.snapshots.marketSince(id, since),
      holders: s.ctx.snapshots.holderHistory(id, since),
    }, { source: 'local' });
  });

  app.get('/tokens/:id/creator', async (req) => {
    const { id } = IdParam.parse(req.params);
    const r = await s.creator.get(id);
    return envelope(h, r.value, { source: r.value.source, fetchedAt: r.value.fetchedAt ?? nowS(), cached: r.cached });
  });
}
