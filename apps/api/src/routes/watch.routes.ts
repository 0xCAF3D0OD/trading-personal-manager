import { CreateClaimInput, CreateTeamWalletInput, CreateWatchSourceInput, ResolveClaimInput, UpdateWatchSourceInput } from '@tpm/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const TwoIds = z.object({ id: z.coerce.number().int().positive(), sid: z.coerce.number().int().positive() });
const StatusQuery = z.object({ status: z.enum(['pending', 'kept', 'contradicted', 'expired']).optional() });
const KindsQuery = z.object({ kinds: z.string().optional() });
const DaysQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(60) });
const DraftInput = z.object({ text: z.string().min(3).max(5000), publishedAt: z.number().int().optional().nullable(), url: z.string().url().optional().nullable() });
const XInput = z.object({ url: z.string().url() });
const ReviewInput = z.object({ note: z.string().max(1000).optional().nullable() });
const LabelInput = z.object({ address: z.string().min(32).max(44), label: z.string().min(2).max(60) });

export function watchRoutes(app: FastifyInstance, s: Services, expensive: { config: { rateLimit: { max: number; timeWindow: string } } }): void {
  const h = s.ctx.sources.health;

  // --- vue d'ensemble et sources --------------------------------------------------
  app.get('/tokens/:id/watch', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.watchPages.overview(id));
  });
  app.get('/tokens/:id/watch/sources', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.watchPages.sources(id));
  });
  app.post('/tokens/:id/watch/sources', expensive, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const input = CreateWatchSourceInput.parse(req.body);
    return reply.status(201).send(envelope(h, await s.watchPages.createSource(id, input)));
  });
  app.patch('/watch/sources/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.watchPages.updateSource(id, UpdateWatchSourceInput.parse(req.body)));
  });
  app.delete('/watch/sources/:id', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    s.watchPages.deleteSource(id);
    return reply.status(204).send();
  });
  app.post('/watch/sources/:id/discover', expensive, async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, await s.watchPages.discover(id));
  });
  app.post('/watch/sources/:id/check', expensive, async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, await s.watchPages.checkNow(id));
  });
  app.get('/watch/sources/:id/snapshots', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.watchPages.snapshots(id));
  });
  app.get('/watch/sources/:id/checks', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.watchPages.checks(id));
  });
  app.get('/watch/snapshots/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.watchPages.snapshot(id));
  });

  // --- changements détectés -------------------------------------------------------
  app.get('/tokens/:id/watch/changes', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.watchPages.changes(id));
  });
  app.post('/watch/changes/:id/review', async (req) => {
    const { id } = IdParam.parse(req.params);
    const { note } = ReviewInput.parse(req.body ?? {});
    return envelope(h, s.watchPages.review(id, note ?? null));
  });

  // --- engagements ----------------------------------------------------------------
  app.get('/tokens/:id/claims', async (req) => {
    const { id } = IdParam.parse(req.params);
    const { status } = StatusQuery.parse(req.query);
    return envelope(h, s.claims.list(id, status));
  });
  app.post('/tokens/:id/claims/draft', async (req) => {
    IdParam.parse(req.params);
    const i = DraftInput.parse(req.body);
    return envelope(h, s.claims.draft(i.text, i.publishedAt ?? null, i.url ?? null));
  });
  app.post('/tokens/:id/claims/draft-from-x', expensive, async (req) => {
    IdParam.parse(req.params);
    const { url } = XInput.parse(req.body);
    return envelope(h, await s.claims.draftFromX(url));
  });
  app.post('/tokens/:id/claims', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    return reply.status(201).send(envelope(h, s.claims.create(id, CreateClaimInput.parse(req.body))));
  });
  app.post('/claims/:id/resolve', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.claims.resolve(id, ResolveClaimInput.parse(req.body)));
  });

  // --- actualités, on-chain, frise -------------------------------------------------
  app.get('/tokens/:id/news', async (req) => {
    const { id } = IdParam.parse(req.params);
    const { kinds } = KindsQuery.parse(req.query);
    const list = (kinds ?? 'news,listing').split(',').filter((k): k is 'news' | 'listing' | 'promo' => ['news', 'listing', 'promo'].includes(k));
    return envelope(h, s.news.list(id, list.length ? list : ['news', 'listing']));
  });
  app.get('/tokens/:id/team-wallets', async (req) => {
    const { id } = IdParam.parse(req.params);
    return envelope(h, s.onchain.wallets(id));
  });
  app.post('/tokens/:id/team-wallets', async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    return reply.status(201).send(envelope(h, s.onchain.addWallet(id, CreateTeamWalletInput.parse(req.body))));
  });
  app.delete('/tokens/:id/team-wallets/:sid', async (req) => {
    const { id, sid } = TwoIds.parse(req.params);
    return envelope(h, s.onchain.removeWallet(id, sid));
  });
  app.post('/watch/address-labels', async (req) => {
    const { address, label } = LabelInput.parse(req.body);
    s.onchain.labelAddress(address, label);
    return envelope(h, { ok: true });
  });
  app.get('/tokens/:id/onchain', async (req) => {
    const { id } = IdParam.parse(req.params);
    const { days } = DaysQuery.parse(req.query);
    return envelope(h, { available: s.onchain.available, actions: s.onchain.actions(id, days), supplyEvents: s.onchain.supplyEvents(id, days) });
  });
  app.get('/tokens/:id/timeline', async (req) => {
    const { id } = IdParam.parse(req.params);
    const { days } = DaysQuery.parse(req.query);
    return envelope(h, s.timeline.build(id, days));
  });
}
