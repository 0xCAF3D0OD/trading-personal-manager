import { CreateAiReportInput } from '@tpm/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { safeFilename, toStandaloneHtml } from '../dossier/export.js';
import { NotFoundError } from '../services/context.js';
import { envelope } from '../plugins/envelope.js';
import type { Services } from '../services/index.js';

const IdParam = z.object({ id: z.coerce.number().int().positive() });
const DossierQuery = z.object({ format: z.enum(['md', 'json']).default('json'), plan: z.enum(['0', '1']).optional() });
const ExportQuery = z.object({ format: z.enum(['md', 'html']).default('html'), plan: z.enum(['0', '1']).optional() });
const ReportParam = z.object({ id: z.coerce.number().int().positive(), rid: z.coerce.number().int().positive() });
const Ids = z.string().optional().transform((v) => (v ? v.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0) : undefined));
const Addresses = z.string().optional().transform((v) => (v ? v.split(',').map((x) => x.trim()).filter((x) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x)) : undefined));
const ListQuery = z.object({ format: z.enum(['md', 'json', 'html']).default('json'), ids: Ids, download: z.enum(['0', '1']).optional() });
const ScannerQuery = z.object({ format: z.enum(['md', 'json', 'html']).default('json'), days: z.coerce.number().int().min(1).max(30).default(1), addresses: Addresses, download: z.enum(['0', '1']).optional() });
const FOOTER = 'Produit par trading-personal-manager : observations datées et sourcées, aucune n’est une recommandation d’achat ou de vente.';
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

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

  /** Dossier en fichier partageable : Markdown brut, ou page HTML autonome imprimable en PDF. */
  app.get('/tokens/:id/dossier/export', expensive, async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { format, plan } = ExportQuery.parse(req.query);
    const token = s.tokens.require(id);
    const view = await s.dossier.get(id, plan === undefined ? {} : { includePlan: plan === '1' });
    const name = safeFilename(['dossier', token.symbol ?? token.address.slice(0, 8), day(view.generatedAt)], format);
    reply.header('content-disposition', `attachment; filename="${name}"`);
    if (format === 'md') return reply.type('text/markdown; charset=utf-8').send(view.markdown);
    const title = `Dossier ${token.symbol ?? token.address.slice(0, 8)}${token.name && token.name !== token.symbol ? ` (${token.name})` : ''}`;
    return reply.type('text/html; charset=utf-8').send(toStandaloneHtml({ title, subtitle: `Empreinte ${view.hash}${view.includesPlan ? ' · plan du journal inclus' : ''}`, generatedAt: view.generatedAt, footer: FOOTER }, view.markdown));
  });

  /** Un rapport conservé, en fichier partageable. */
  app.get('/tokens/:id/reports/:rid/export', async (req, reply) => {
    const { id, rid } = ReportParam.parse(req.params);
    const { format } = ExportQuery.parse(req.query);
    const token = s.tokens.require(id);
    const r = s.reports.list(id).find((x) => x.id === rid);
    if (!r) throw new NotFoundError(`Rapport ${rid} introuvable`);
    const sym = token.symbol ?? token.address.slice(0, 8);
    const name = safeFilename(['rapport', sym, day(r.createdAt), r.provider], format);
    reply.header('content-disposition', `attachment; filename="${name}"`);
    const head = `# Rapport : ${sym}\n\n> ${new Date(r.createdAt * 1000).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })} · ${r.provider}${r.model ? ` · ${r.model}` : ''} · dossier ${r.dossierHash} · consigne v${r.promptVersion}${r.note ? `\n> ${r.note}` : ''}\n\n`;
    if (format === 'md') return reply.type('text/markdown; charset=utf-8').send(`${head}${r.content}\n\n---\n\n${FOOTER}\n`);
    return reply.type('text/html; charset=utf-8').send(toStandaloneHtml({ title: `Rapport ${sym}`, subtitle: `${r.provider}${r.model ? ` · ${r.model}` : ''} · dossier ${r.dossierHash} · consigne v${r.promptVersion}${r.note ? ` · ${r.note}` : ''}`, generatedAt: r.createdAt, footer: FOOTER }, r.content));
  });

  /** Dossier de toute la liste (ou de la sélection filtrée) : json, md, ou html autonome ; en pièce jointe si download=1. */
  app.get('/dossier/list', async (req, reply) => {
    const { format, ids, download } = ListQuery.parse(req.query);
    const view = s.dossier.list(ids);
    if (format === 'json') return envelope(h, view, { source: 'local' });
    if (download === '1') reply.header('content-disposition', `attachment; filename="${safeFilename(['dossier-liste', day(view.generatedAt)], format)}"`);
    if (format === 'md') return reply.type('text/markdown; charset=utf-8').send(view.markdown);
    return reply.type('text/html; charset=utf-8').send(toStandaloneHtml({ title: 'Dossier : liste de surveillance', subtitle: `${view.count} token(s) · empreinte ${view.hash}`, generatedAt: view.generatedAt, footer: FOOTER }, view.markdown));
  });

  /** Dossier des résultats du scanner (ou de la sélection filtrée). */
  app.get('/dossier/scanner', async (req, reply) => {
    const { format, days, addresses, download } = ScannerQuery.parse(req.query);
    const view = s.dossier.scanner(days, addresses);
    if (format === 'json') return envelope(h, view, { source: 'local' });
    if (download === '1') reply.header('content-disposition', `attachment; filename="${safeFilename(['dossier-scanner', day(view.generatedAt)], format)}"`);
    if (format === 'md') return reply.type('text/markdown; charset=utf-8').send(view.markdown);
    return reply.type('text/html; charset=utf-8').send(toStandaloneHtml({ title: 'Dossier : résultats du scanner', subtitle: `${view.count} token(s) gardé(s) sur ${days} jour(s) · empreinte ${view.hash}`, generatedAt: view.generatedAt, footer: FOOTER }, view.markdown));
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
