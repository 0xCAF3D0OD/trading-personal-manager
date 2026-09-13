import type { CreateWatchSourceInput, PageChange, PageSnapshot, UpdateWatchSourceInput, WatchOverview, WatchSettings, WatchSource, WatchSourceMode } from '@tpm/shared';
import { gzipSync } from 'node:zlib';
import type { SourceRow, VolatileEntry } from '../../db/repositories/watch.repo.js';
import { toSource } from '../../db/repositories/watch.repo.js';
import { nowS } from '../../db/client.js';
import { textMentionsChange } from '../../watch/claims-extract.js';
import { diffLines, hashLines } from '../../watch/differ.js';
import { fetchPage } from '../../watch/fetcher.js';
import { htmlToLines, jsonToLines, looksClientRendered, type Line } from '../../watch/normalizer.js';
import { RendererClient } from '../../watch/renderer-client.js';
import { isAllowedByRobots } from '../../watch/robots.js';
import { filterVolatile, removeVolatile, updateVolatility } from '../../watch/volatility.js';
import type { AlertService } from '../alert.service.js';
import { AppContext, NotFoundError, ValidationError } from '../context.js';
import type { SettingsService } from '../settings.service.js';
import type { TokenService } from '../token.service.js';

const PAGE_KINDS = ['website', 'docs'];
const UA_TOKEN = 'trading-personal-manager';

export class WatchPageService {
  readonly renderer: RendererClient;

  constructor(
    private readonly ctx: AppContext,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
    private readonly alerts: AlertService,
  ) {
    this.renderer = new RendererClient(ctx.env.RENDERER_URL);
  }

  private get cfg(): WatchSettings {
    return this.settings.get<WatchSettings>('watch');
  }
  private get userAgent(): string {
    const contact = this.ctx.env.WATCH_USER_AGENT_CONTACT ?? this.cfg.userAgentContact ?? 'contact non renseigné';
    return `${UA_TOKEN}/0.3 (+veille personnelle; ${contact})`;
  }

  // --- sources -----------------------------------------------------------------

  overview(tokenId: number): WatchOverview {
    this.tokens.require(tokenId);
    const sources = this.ctx.watch.sources(tokenId).map(toSource);
    const news = this.ctx.news.counts(tokenId);
    return {
      sources,
      counts: { claimsPending: this.ctx.claims.countPending(tokenId), changesUnreviewed: this.ctx.watch.countUnreviewed(tokenId), promo: news.promo, news: news.news },
      rendererAvailable: this.renderer.available,
      automatedSources: sources.filter((s) => s.automated).map((s) => s.label),
      manualSources: sources.filter((s) => !s.automated).map((s) => s.label),
    };
  }

  sources(tokenId: number): WatchSource[] {
    this.tokens.require(tokenId);
    return this.ctx.watch.sources(tokenId).map(toSource);
  }

  requireSource(id: number): SourceRow {
    const s = this.ctx.watch.source(id);
    if (!s) throw new NotFoundError(`Source ${id} introuvable`);
    return s;
  }

  async createSource(tokenId: number, input: CreateWatchSourceInput): Promise<WatchSource> {
    this.tokens.require(tokenId);
    const cfg = this.cfg;
    if (PAGE_KINDS.includes(input.kind) || input.kind === 'github' || input.kind === 'exchange_feed') {
      if (!input.url) throw new ValidationError('Une URL est requise pour cette source.');
    }
    if (input.kind === 'x_account' && !input.handle) throw new ValidationError('Le nom du compte X est requis.');
    if (input.kind === 'github' && !/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(input.url ?? '')) throw new ValidationError('URL GitHub attendue : https://github.com/organisation/depot');
    const interval = input.checkIntervalS ?? (PAGE_KINDS.includes(input.kind) ? cfg.pageCheckIntervalS : input.kind === 'github' ? 6 * 3600 : cfg.newsIntervalS);
    const row = this.ctx.watch.insertSource({
      tokenId, kind: input.kind, label: input.label, url: input.url ?? null, handle: input.handle?.replace(/^@/, '') ?? null,
      checkIntervalS: interval, note: input.note ?? null,
    });
    if (input.kind === 'x_account') {
      this.ctx.watch.updateSource(row.id, { last_status: 'manual', next_check_at: 4_102_444_800 });
    }
    if (PAGE_KINDS.includes(input.kind)) {
      // Découverte hors requête : elle peut prendre plusieurs secondes si le rendu est nécessaire.
      setImmediate(() => void this.discover(row.id).catch((e) => this.ctx.log.warn({ err: (e as Error).message, sourceId: row.id }, 'Découverte échouée')));
    }
    return toSource(this.requireSource(row.id));
  }

  updateSource(id: number, patch: UpdateWatchSourceInput): WatchSource {
    const s = this.requireSource(id);
    const upd: Partial<Record<keyof SourceRow, string | number | null>> = {};
    if (patch.label !== undefined) upd.label = patch.label;
    if (patch.enabled !== undefined) upd.enabled = patch.enabled ? 1 : 0;
    if (patch.checkIntervalS !== undefined) upd.check_interval_s = patch.checkIntervalS;
    if (patch.note !== undefined) upd.note = patch.note;
    if (patch.renderWaitMs !== undefined) upd.render_wait_ms = patch.renderWaitMs;
    if (patch.apiUrl !== undefined) upd.api_url = patch.apiUrl;
    if (patch.jsonPointer !== undefined) upd.json_pointer = patch.jsonPointer;
    if (patch.mode !== undefined && patch.mode !== s.mode) {
      if (!PAGE_KINDS.includes(s.kind)) throw new ValidationError('Le mode ne s’applique qu’aux pages et à la documentation.');
      if (patch.mode === 'json_api' && !(patch.apiUrl ?? s.api_url)) throw new ValidationError('Le mode API JSON demande l’URL de l’appel à surveiller.');
      if (patch.mode === 'headless' && !this.renderer.available) throw new ValidationError('Le mode rendu sans tête demande le service renderer (RENDERER_URL).');
      upd.mode = patch.mode;
      // Un changement de mode crée un nouveau snapshot de référence et n'est pas compté comme un changement.
      upd.meta = JSON.stringify({ ...(safeJson(s.meta) ?? {}), pendingBaseline: true });
      upd.etag = null; upd.last_modified = null; upd.last_status = null; upd.last_error = null; upd.next_check_at = nowS();
    }
    if (patch.removeVolatileKey) {
      upd.volatile_lines = JSON.stringify(removeVolatile(safeJson<VolatileEntry[]>(s.volatile_lines) ?? [], patch.removeVolatileKey));
    }
    this.ctx.watch.updateSource(id, upd);
    return toSource(this.requireSource(id));
  }

  deleteSource(id: number): void {
    this.requireSource(id);
    this.ctx.watch.deleteSource(id);
  }

  snapshots(sourceId: number): PageSnapshot[] { this.requireSource(sourceId); return this.ctx.watch.snapshots(sourceId); }
  snapshot(id: number): PageSnapshot { const s = this.ctx.watch.snapshot(id); if (!s) throw new NotFoundError(`Snapshot ${id} introuvable`); return s; }
  checks(sourceId: number) { this.requireSource(sourceId); return this.ctx.watch.checks(sourceId); }
  changes(tokenId: number): PageChange[] { this.tokens.require(tokenId); return this.ctx.watch.changes(tokenId); }

  review(changeId: number, note: string | null): PageChange {
    const c = this.ctx.watch.change(changeId);
    if (!c) throw new NotFoundError(`Changement ${changeId} introuvable`);
    this.ctx.watch.updateChange(changeId, { reviewed_at: nowS(), review_note: note });
    return this.ctx.watch.change(changeId) as PageChange;
  }

  // --- découverte ----------------------------------------------------------------

  /** Trois temps : HTML simple suffisant ? sinon rendu de découverte et capture des appels JSON ; sinon rendu sans tête. */
  async discover(sourceId: number): Promise<WatchSource> {
    const s = this.requireSource(sourceId);
    if (!s.url) throw new ValidationError('Source sans URL');
    const robots = await this.robotsAllows(s.url);
    if (!robots) {
      this.ctx.watch.updateSource(s.id, { last_status: 'blocked_by_robots', last_error: 'robots.txt interdit cette page à notre agent', last_checked_at: nowS(), next_check_at: nowS() + 7 * 86400 });
      return toSource(this.requireSource(s.id));
    }
    const r = await fetchPage(s.url, { userAgent: this.userAgent });
    if (r.status === 'ok' && r.body) {
      const { lines } = htmlToLines(r.body);
      if (!looksClientRendered(r.body, lines)) {
        this.ctx.watch.updateSource(s.id, { mode: 'html', last_status: null, next_check_at: nowS() });
        await this.check(this.requireSource(s.id));
        return toSource(this.requireSource(s.id));
      }
    } else if (r.status !== 'ok') {
      this.ctx.watch.updateSource(s.id, { last_status: r.status, last_error: r.error, last_checked_at: nowS(), next_check_at: nowS() + s.check_interval_s });
      return toSource(this.requireSource(s.id));
    }
    if (!this.renderer.available) {
      this.ctx.watch.updateSource(s.id, {
        last_status: 'needs_mode_choice', last_checked_at: nowS(), next_check_at: 4_102_444_800,
        last_error: 'Page rendue côté client. Le service renderer (RENDERER_URL) est absent : renseignez l’URL d’une API JSON à la main, ou activez le service.',
      });
      return toSource(this.requireSource(s.id));
    }
    const rendered = await this.renderer.render(s.url, s.render_wait_ms ?? this.cfg.headlessWaitMs, this.cfg.tokenomicsKeywords);
    const candidates = rendered.jsonResponses.filter((e) => e.score > -3 && e.size > 20);
    if (candidates.length) {
      this.ctx.watch.updateSource(s.id, {
        discovered_endpoints: JSON.stringify(candidates.slice(0, 25)), last_status: 'needs_mode_choice', last_checked_at: nowS(), next_check_at: 4_102_444_800,
        last_error: `${candidates.length} appel(s) JSON observé(s) pendant le chargement : choisissez celui à surveiller, ou le mode rendu sans tête.`,
      });
      return toSource(this.requireSource(s.id));
    }
    this.ctx.watch.updateSource(s.id, { mode: 'headless', discovered_endpoints: '[]', last_status: null, next_check_at: nowS() });
    await this.check(this.requireSource(s.id));
    return toSource(this.requireSource(s.id));
  }

  // --- vérification -------------------------------------------------------------

  async checkNow(sourceId: number): Promise<WatchSource> {
    const s = this.requireSource(sourceId);
    if (s.last_status === 'needs_mode_choice') return this.discover(sourceId);
    await this.check(s);
    return toSource(this.requireSource(sourceId));
  }

  /** Job : toutes les sources de pages échues. */
  async runDue(limit = 30): Promise<{ checked: number; changed: number }> {
    const due = this.ctx.watch.dueSources(PAGE_KINDS, limit);
    let changed = 0;
    for (const s of due) {
      try {
        const r = await this.check(s);
        if (r === 'changed') changed++;
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message, sourceId: s.id }, 'Vérification de page échouée');
        this.ctx.watch.updateSource(s.id, { last_status: 'error', last_error: (err as Error).message, last_checked_at: nowS(), next_check_at: nowS() + s.check_interval_s });
      }
    }
    return { checked: due.length, changed };
  }

  async check(s: SourceRow): Promise<string> {
    if (!PAGE_KINDS.includes(s.kind)) return 'skipped';
    const now = nowS();
    const finish = (status: string, error: string | null = null, extra: Partial<Record<keyof SourceRow, string | number | null>> = {}) => {
      this.ctx.watch.updateSource(s.id, { last_status: status, last_error: error, last_checked_at: now, next_check_at: now + s.check_interval_s, ...extra });
      return status;
    };
    let lines: Line[]; let title: string | null = null; let raw: string | null = null; let finalUrl: string | null = null; let httpStatus: number | null = null;
    const headerExtra: Partial<Record<keyof SourceRow, string | number | null>> = {};

    if (s.mode === 'json_api') {
      if (!s.api_url) return finish('needs_mode_choice', 'URL de l’API manquante');
      const r = await fetchPage(s.api_url, { userAgent: this.userAgent, etag: s.etag, lastModified: s.last_modified, accept: 'application/json', headers: safeJson<Record<string, string>>(s.api_headers) ?? {} });
      httpStatus = r.httpStatus;
      if (r.status === 'not_modified') { this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: null, changed: false, status: 'unchanged', snapshotId: null }); return finish('unchanged'); }
      if (r.status !== 'ok' || !r.body) { this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: null, changed: false, status: r.status, snapshotId: null }); return finish(r.status, r.error); }
      let json: unknown;
      try { json = JSON.parse(r.body); } catch { return finish('http_error', 'La réponse n’est pas du JSON'); }
      lines = jsonToLines(json, s.json_pointer); raw = r.body; finalUrl = r.finalUrl; headerExtra.etag = r.etag; headerExtra.last_modified = r.lastModified;
    } else if (s.mode === 'headless') {
      if (!s.url) return finish('error', 'Source sans URL');
      if (!this.renderer.available) return finish('render_error', 'Service renderer absent (RENDERER_URL) : mode rendu sans tête indisponible');
      if (!(await this.robotsAllows(s.url))) return finish('blocked_by_robots', 'robots.txt interdit cette page à notre agent', { next_check_at: now + 7 * 86400 });
      const r = await this.renderer.render(s.url, s.render_wait_ms ?? this.cfg.headlessWaitMs, this.cfg.tokenomicsKeywords);
      const parsed = htmlToLines(r.html);
      lines = parsed.lines; title = parsed.title; raw = r.html; finalUrl = r.finalUrl; httpStatus = 200;
    } else {
      if (!s.url) return finish('error', 'Source sans URL');
      if (!(await this.robotsAllows(s.url))) return finish('blocked_by_robots', 'robots.txt interdit cette page à notre agent', { next_check_at: now + 7 * 86400 });
      const r = await fetchPage(s.url, { userAgent: this.userAgent, etag: s.etag, lastModified: s.last_modified });
      httpStatus = r.httpStatus;
      if (r.status === 'not_modified') { this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: null, changed: false, status: 'unchanged', snapshotId: null }); return finish('unchanged'); }
      if (r.status !== 'ok' || !r.body) { this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: null, changed: false, status: r.status, snapshotId: null }); return finish(r.status, r.error); }
      const parsed = htmlToLines(r.body);
      lines = parsed.lines; title = parsed.title; raw = r.body; finalUrl = r.finalUrl; headerExtra.etag = r.etag; headerExtra.last_modified = r.lastModified;
      if (looksClientRendered(r.body, lines) && !this.ctx.watch.latestSnapshot(s.id)) {
        return finish('needs_mode_choice', 'La page semble rendue côté client : lancez la découverte pour choisir un mode.', { next_check_at: 4_102_444_800 });
      }
    }
    return this.ingest(s, lines, title, raw, finalUrl, httpStatus, finish, headerExtra);
  }

  private async ingest(
    s: SourceRow, lines: Line[], title: string | null, raw: string | null, finalUrl: string | null, httpStatus: number | null,
    finish: (status: string, error?: string | null, extra?: Partial<Record<keyof SourceRow, string | number | null>>) => string,
    headerExtra: Partial<Record<keyof SourceRow, string | number | null>>,
  ): Promise<string> {
    const cfg = this.cfg;
    const meta = safeJson<Record<string, unknown>>(s.meta) ?? {};
    const pendingBaseline = meta.pendingBaseline === true;
    let entries = safeJson<VolatileEntry[]>(s.volatile_lines) ?? [];
    const filtered = filterVolatile(lines, entries);
    const hash = hashLines(filtered);
    const prev = this.ctx.watch.latestSnapshot(s.id);
    const rawBuf = raw ? gzipSync(Buffer.from(raw, 'utf8')) : null;

    if (prev && prev.contentHash === hash && !pendingBaseline) {
      this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: hash, changed: false, status: 'unchanged', snapshotId: null });
      return finish('unchanged', null, headerExtra);
    }
    const snapshotId = this.ctx.watch.insertSnapshot({ sourceId: s.id, mode: s.mode, contentHash: hash, lines, title, rawBody: rawBuf, rawSize: raw?.length ?? null, finalUrl });
    if (!prev || pendingBaseline) {
      this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: hash, changed: false, status: 'baseline', snapshotId });
      if (pendingBaseline) { delete meta.pendingBaseline; headerExtra.meta = JSON.stringify(meta); }
      return finish('ok', null, headerExtra);
    }

    const prevFiltered = filterVolatile(prev.lines, entries);
    const diff = diffLines(prevFiltered, filtered, { similarityThreshold: cfg.similarityThreshold, keywords: cfg.tokenomicsKeywords, pairByPath: s.mode === 'json_api' });
    entries = updateVolatility(entries, diff.hunks, cfg.volatileAfterChanges, nowS());
    headerExtra.volatile_lines = JSON.stringify(entries);
    // Les lignes devenues volatiles à ce passage ne sont plus considérées comme des changements.
    const newlyVolatile = new Set(entries.filter((e) => e.volatile).map((e) => e.key));
    const hunks = diff.hunks.filter((h) => !(h.op === 'changed' && h.before !== null && h.after !== null && newlyVolatile.has(volatileKeyOf(h.path, h.before))));
    if (!hunks.length || diff.severity === null) {
      this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: hash, changed: false, status: 'unchanged', snapshotId });
      return finish('unchanged', null, headerExtra);
    }
    const severity = diff.severity;
    const numericChanges = diff.numericChanges;
    const tokenId = s.token_id;
    const assoc = severity === 'minor' ? { announced: null as boolean | null, claimId: null as number | null } : this.associate(tokenId, numericChanges, hunks.map((h) => `${h.path} ${h.before ?? ''} ${h.after ?? ''}`), nowS() - cfg.associationWindowH * 3600, nowS());
    const changeId = this.ctx.watch.insertChange({
      sourceId: s.id, fromSnapshotId: prev.id, toSnapshotId: snapshotId, severity, hunks, numericChanges,
      announced: assoc.announced, announcedClaimId: assoc.claimId, announceCheckDueAt: severity === 'minor' || assoc.announced ? null : nowS() + cfg.associationWindowH * 3600,
    });
    this.ctx.watch.insertCheck({ sourceId: s.id, httpStatus, contentHash: hash, changed: true, status: 'changed', snapshotId });
    await this.notifyChange(tokenId, changeId, s, severity, numericChanges, hunks.length, assoc.announced);
    return finish('changed', null, headerExtra);
  }

  /** Recherche d'une annonce (engagement ou actualité) mentionnant le changement, dans la fenêtre donnée. */
  associate(tokenId: number, numericChanges: PageChange['numericChanges'], hunkTexts: string[], fromTs: number, toTs: number): { announced: boolean; claimId: number | null } {
    const claims = this.ctx.claims.around(tokenId, fromTs, toTs).filter((c) => c.origin !== 'website');
    const news = this.ctx.news.around(tokenId, fromTs, toTs);
    const keywords = this.cfg.tokenomicsKeywords;
    const changes = numericChanges.length ? numericChanges : hunkTexts.map((t) => ({ beforeValue: null, afterValue: null, unit: null, keywords: keywords.filter((k) => t.toLowerCase().includes(k.toLowerCase())) }));
    for (const c of claims) if (changes.some((ch) => textMentionsChange(c.text, ch))) return { announced: true, claimId: c.id };
    for (const n of news) if (changes.some((ch) => textMentionsChange(n.title, ch))) return { announced: true, claimId: null };
    return { announced: false, claimId: null };
  }

  private async notifyChange(tokenId: number, changeId: number, s: SourceRow, severity: PageChange['severity'], numericChanges: PageChange['numericChanges'], hunkCount: number, announced: boolean | null): Promise<void> {
    if (severity === 'minor') return;
    if (severity === 'content' && !this.cfg.notifyContentChanges) return;
    const summary = numericChanges.slice(0, 3).map((c) => `${c.path || '(racine)'} — ${c.before} → ${c.after}`).join(' ; ') || `${hunkCount} bloc(s) de texte modifié(s)`;
    const annonce = announced === true ? 'Annonce associée : oui.' : announced === false ? `Annonce associée : aucune trouvée pour l’instant, réévaluation dans ${this.cfg.associationWindowH} h.` : '';
    const r = await this.alerts.fireEvent({
      tokenId, type: severity === 'tokenomics' ? 'watch_tokenomics_change' : 'watch_content_change',
      priority: severity === 'tokenomics' ? 'urgent' : 'default',
      ruleText: `${severity === 'tokenomics' ? 'Tokenomics modifiées' : 'Contenu modifié'} sur « ${s.label} » (${s.url ?? s.api_url ?? ''}) : ${summary}. ${annonce}`.trim(),
      payload: { changeId, sourceId: s.id, numericChanges }, dedupeKey: `change:${changeId}`, cooldownS: 0,
    });
    if (r.fired) this.ctx.watch.updateChange(changeId, { alert_sent_at: nowS() });
  }

  /** Job horaire : les changements dont la fenêtre d'association est échue sans annonce reçoivent le second signal. */
  async reviewUnannounced(): Promise<number> {
    const cfg = this.cfg;
    let flagged = 0;
    for (const c of this.ctx.watch.changesAwaitingAssociation()) {
      const assoc = this.associate(c.tokenId, c.numericChanges, c.hunks.map((h) => `${h.path} ${h.before ?? ''} ${h.after ?? ''}`), c.detectedAt - cfg.associationWindowH * 3600, c.detectedAt + cfg.associationWindowH * 3600);
      if (assoc.announced) { this.ctx.watch.updateChange(c.id, { announced: 1, announced_claim_id: assoc.claimId }); continue; }
      this.ctx.watch.updateChange(c.id, { unannounced_flag: 1 });
      const s = this.ctx.watch.source(c.sourceId);
      const first = c.numericChanges[0];
      const summary = first ? `${first.path || '(racine)'} — ${first.before} → ${first.after}` : `${c.hunks.length} bloc(s) de texte`;
      // Trace dans le journal des engagements : ce que le site disait avant, contredit sans communication.
      const before = first ? `${first.path ? first.path + ' : ' : ''}${c.hunks.find((h) => h.op === 'changed')?.before ?? first.before}` : c.hunks.find((h) => h.before)?.before ?? '';
      if (before) {
        this.ctx.claims.insert({
          tokenId: c.tokenId, sourceId: c.sourceId, origin: 'website', publishedAt: c.detectedAt, url: s?.url ?? null, author: null, text: before,
          type: c.severity === 'tokenomics' ? 'tokenomics' : 'other', subtype: null, dueAt: null, extractedNumbers: [], verificationKind: 'page_content',
          verificationRef: s?.url ?? null, linkedChangeId: c.id, status: 'contradicted',
          verificationNote: `Modifié sur le site le ${new Date(c.detectedAt * 1000).toLocaleString('fr-FR')} sans communication trouvée dans les ${cfg.associationWindowH} h avant ou après.`,
        });
      }
      const r = await this.alerts.fireEvent({
        tokenId: c.tokenId, type: 'watch_unannounced_change', priority: c.severity === 'tokenomics' ? 'urgent' : 'default',
        ruleText: `Modifié sans communication : le changement « ${summary} » du ${new Date(c.detectedAt * 1000).toLocaleString('fr-FR')} sur « ${s?.label ?? '?'} » n’a été accompagné d’aucune annonce dans les ${cfg.associationWindowH} h avant ou après.`,
        payload: { changeId: c.id }, dedupeKey: `unannounced:${c.id}`, cooldownS: 0,
      });
      if (r.fired) this.ctx.watch.updateChange(c.id, { unannounced_alert_sent_at: nowS() });
      flagged++;
    }
    return flagged;
  }

  maintenance(): { rawPurged: number; checksPurged: number } {
    return { rawPurged: this.ctx.watch.purgeRawBodies(90 * 86400), checksPurged: this.ctx.watch.purgeChecks(180 * 86400) };
  }

  // --- robots ---------------------------------------------------------------------

  private async robotsAllows(url: string): Promise<boolean> {
    let origin: string, path: string;
    try { const u = new URL(url); origin = u.origin; path = u.pathname + u.search; } catch { return false; }
    const hit = await this.ctx.cache.getOrFetch<string>(`robots:${origin}`, 86400, async () => {
      const r = await fetchPage(`${origin}/robots.txt`, { userAgent: this.userAgent, accept: 'text/plain,*/*;q=0.5', maxBytes: 256 * 1024, timeoutMs: 10_000 });
      return { value: r.status === 'ok' && r.body ? r.body : '', source: 'local' };
    }, { staleOnError: true }).catch(() => ({ value: '' }));
    return isAllowedByRobots(hit.value || null, path, UA_TOKEN);
  }
}

function safeJson<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}
import { volatileKey as volatileKeyOf } from '../../watch/numbers.js';
