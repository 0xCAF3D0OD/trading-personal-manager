import type { NewsItem, WatchSettings } from '@tpm/shared';
import { XMLParser } from 'fast-xml-parser';
import type { SourceRow } from '../../db/repositories/watch.repo.js';
import { nowS } from '../../db/client.js';
import { fetchPage } from '../../watch/fetcher.js';
import { canonicalUrl, classifyNews, dedupKey, domainOf } from '../../watch/news-rules.js';
import type { UsageRepo } from '../../db/repositories/usage.repo.js';
import { AppContext } from '../context.js';
import type { SettingsService } from '../settings.service.js';
import type { TokenService } from '../token.service.js';

interface RawItem { title: string; url: string; publishedAt: number; externalId: string | null; content: string | null; provider: string }

/** Actualités tierces : CryptoPanic, flux RSS de recherche, flux officiels d'exchanges. Séparées des engagements par construction. */
export class NewsService {
  private readonly xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  constructor(
    private readonly ctx: AppContext,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
  ) {}

  private get cfg(): WatchSettings { return this.settings.get<WatchSettings>('watch'); }
  private get usage(): UsageRepo { return this.ctx.usage; }

  list(tokenId: number, kinds: ('news' | 'listing' | 'promo')[]): NewsItem[] {
    this.tokens.require(tokenId);
    return this.ctx.news.list(tokenId, kinds);
  }

  /** Job horaire : pour chaque token actif, requête par nom + symbole, plus les sources `news_query` et `exchange_feed` configurées. */
  async runAll(): Promise<{ tokens: number; inserted: number }> {
    const tokens = this.ctx.tokens.listActive();
    let inserted = 0;
    const feeds = this.cfg.exchangeFeeds;
    const feedItems = new Map<string, RawItem[]>();
    for (const f of feeds) {
      try { feedItems.set(f.name, await this.fetchRss(f.url, `exchange:${f.name.toLowerCase().replace(/\s+/g, '-')}`)); }
      catch (err) { this.ctx.log.warn({ err: (err as Error).message, feed: f.name }, 'Flux exchange indisponible'); }
    }
    for (const t of tokens) {
      const symbol = t.symbol ?? null;
      const name = t.name ?? symbol;
      if (!name) continue;
      const items: RawItem[] = [];
      try { items.push(...(await this.fetchGoogleNews(`"${name}" solana`))); } catch (err) { this.ctx.log.warn({ err: (err as Error).message }, 'RSS Google News indisponible'); }
      if (symbol && this.ctx.env.CRYPTOPANIC_API_KEY) {
        try { items.push(...(await this.fetchCryptoPanic(symbol))); } catch (err) { this.ctx.log.warn({ err: (err as Error).message }, 'CryptoPanic indisponible'); }
      }
      for (const src of this.ctx.watch.sources(t.id).filter((s) => s.enabled === 1 && (s.kind === 'news_query' || s.kind === 'exchange_feed'))) {
        try {
          if (src.kind === 'news_query') items.push(...(await this.fetchGoogleNews(src.label)));
          else if (src.url) items.push(...(await this.fetchRss(src.url, `feed:${src.label.toLowerCase()}`)));
          this.ctx.watch.updateSource(src.id, { last_checked_at: nowS(), last_status: 'ok', last_error: null, next_check_at: nowS() + src.check_interval_s });
        } catch (err) {
          this.ctx.watch.updateSource(src.id, { last_checked_at: nowS(), last_status: 'error', last_error: (err as Error).message, next_check_at: nowS() + src.check_interval_s });
        }
      }
      // Flux d'exchanges : on ne garde que les items qui citent le token.
      const needles = [symbol, name].filter((x): x is string => !!x && x.length >= 3).map((x) => x.toLowerCase());
      for (const list of feedItems.values()) for (const it of list) if (needles.some((n) => it.title.toLowerCase().includes(n))) items.push(it);
      inserted += this.store(t.id, symbol, t.created_at, items);
    }
    return { tokens: tokens.length, inserted };
  }

  private store(tokenId: number, symbol: string | null, createdAt: number | null, items: RawItem[]): number {
    const cfg = this.cfg;
    const now = nowS();
    let n = 0;
    for (const it of items) {
      if (!it.title || !it.url) continue;
      const canonical = canonicalUrl(it.url);
      const domain = domainOf(it.url);
      const firstSeen = this.ctx.news.domainFirstSeen(domain);
      const cls = classifyNews({
        title: it.title, url: it.url, content: it.content, symbol,
        tokenAgeDays: createdAt ? Math.floor((now - createdAt) / 86400) : null,
        domainFirstSeenDaysAgo: firstSeen ? Math.floor((now - firstSeen) / 86400) : null,
        domainTokenCount: this.ctx.news.domainTokenCount(domain),
      }, { prWireDomains: cfg.prWireDomains, sponsoredPatterns: cfg.sponsoredPatterns, pricePredictionMaxTokenAgeDays: cfg.pricePredictionMaxTokenAgeDays });
      if (this.ctx.news.upsert({ tokenId, provider: it.provider, externalId: it.externalId, publishedAt: it.publishedAt, title: it.title.trim(), url: it.url, canonicalUrl: canonical, domain, dedupKey: dedupKey(it.title, canonical), kind: cls.kind, promoFlags: cls.promoFlags })) n++;
    }
    return n;
  }

  private async fetchGoogleNews(query: string): Promise<RawItem[]> {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
    return this.fetchRss(url, 'google_news_rss');
  }

  private async fetchRss(url: string, provider: string): Promise<RawItem[]> {
    const started = Date.now();
    const r = await fetchPage(url, { userAgent: 'trading-personal-manager/0.3 (+rss)', accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5', timeoutMs: 15_000 });
    this.usage.record({ provider: 'local', endpoint: `rss:${provider}`, status: r.httpStatus, durationMs: Date.now() - started });
    if (r.status !== 'ok' || !r.body) throw new Error(`${provider} : ${r.error ?? r.status}`);
    const doc = this.xml.parse(r.body) as any;
    const items: any[] = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
    const list = Array.isArray(items) ? items : [items];
    return list.slice(0, 50).map((it) => {
      const title = text(it.title);
      const link = typeof it.link === 'string' ? it.link : it.link?.['@_href'] ?? (Array.isArray(it.link) ? it.link[0]?.['@_href'] : null) ?? it.guid?.['#text'] ?? '';
      const date = text(it.pubDate) || text(it.published) || text(it.updated) || text(it['dc:date']);
      const ts = date ? Math.floor(new Date(date).getTime() / 1000) : nowS();
      return { title, url: String(link), publishedAt: Number.isFinite(ts) ? ts : nowS(), externalId: text(it.guid) || null, content: text(it.description) || text(it.summary) || null, provider };
    }).filter((x) => x.title && x.url);
  }

  private async fetchCryptoPanic(symbol: string): Promise<RawItem[]> {
    const key = this.ctx.env.CRYPTOPANIC_API_KEY as string;
    const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${encodeURIComponent(key)}&currencies=${encodeURIComponent(symbol)}&public=true`;
    const started = Date.now();
    const r = await fetchPage(url, { userAgent: 'trading-personal-manager/0.3', accept: 'application/json', timeoutMs: 15_000 });
    this.usage.record({ provider: 'local', endpoint: 'cryptopanic', status: r.httpStatus, durationMs: Date.now() - started });
    if (r.status !== 'ok' || !r.body) throw new Error(`CryptoPanic : ${r.error ?? r.status}`);
    const data = JSON.parse(r.body) as { results?: any[] };
    return (data.results ?? []).map((p) => ({
      title: String(p.title ?? ''), url: String(p.original_url ?? p.url ?? ''), publishedAt: p.published_at ? Math.floor(new Date(p.published_at).getTime() / 1000) : nowS(),
      externalId: p.id ? String(p.id) : null, content: typeof p.description === 'string' ? p.description : null, provider: 'cryptopanic',
    }));
  }
}

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.replace(/<[^>]+>/g, '').trim();
  if (typeof v === 'object' && v && '#text' in (v as object)) return String((v as { '#text': unknown })['#text']).replace(/<[^>]+>/g, '').trim();
  return String(v);
}
export type { SourceRow };
