import type { NewsItem } from '@tpm/shared';
import type { Db } from '../client.js';
import { nowS } from '../client.js';

interface NewsRow { id: number; token_id: number; provider: string; external_id: string | null; published_at: number; fetched_at: number; title: string; url: string; canonical_url: string; domain: string; dedup_key: string; kind: string; promo_flags: string }
const toNews = (r: NewsRow): NewsItem => ({
  id: r.id, tokenId: r.token_id, provider: r.provider, publishedAt: r.published_at, fetchedAt: r.fetched_at, title: r.title, url: r.url, domain: r.domain,
  kind: r.kind as NewsItem['kind'], promoFlags: (() => { try { return JSON.parse(r.promo_flags); } catch { return []; } })(),
});

export class NewsRepo {
  constructor(private readonly db: Db) {}

  list(tokenId: number, kinds: string[], limit = 200): NewsItem[] {
    const ph = kinds.map(() => '?').join(',');
    return (this.db.prepare(`SELECT * FROM news_items WHERE token_id = ? AND kind IN (${ph}) ORDER BY published_at DESC LIMIT ?`).all(tokenId, ...kinds, limit) as unknown as NewsRow[]).map(toNews);
  }
  around(tokenId: number, fromTs: number, toTs: number): NewsItem[] {
    return (this.db.prepare('SELECT * FROM news_items WHERE token_id = ? AND published_at BETWEEN ? AND ? ORDER BY published_at DESC').all(tokenId, fromTs, toTs) as unknown as NewsRow[]).map(toNews);
  }
  /** Insère si la clé de dédoublonnage est inconnue ; sinon note le fournisseur supplémentaire. Renvoie true si inséré. */
  upsert(n: { tokenId: number; provider: string; externalId: string | null; publishedAt: number; title: string; url: string; canonicalUrl: string; domain: string; dedupKey: string; kind: string; promoFlags: { code: string; detail: string }[] }): boolean {
    const existing = this.db.prepare('SELECT id, provider, promo_flags FROM news_items WHERE token_id = ? AND dedup_key = ?').get(n.tokenId, n.dedupKey) as { id: number; provider: string; promo_flags: string } | undefined;
    if (existing) {
      if (existing.provider !== n.provider) {
        let flags: { code: string; detail: string }[] = [];
        try { flags = JSON.parse(existing.promo_flags); } catch { /* vide */ }
        if (!flags.some((f) => f.code === 'also_seen_on' && f.detail === n.provider)) {
          flags.push({ code: 'also_seen_on', detail: n.provider });
          this.db.prepare('UPDATE news_items SET promo_flags = ? WHERE id = ?').run(JSON.stringify(flags), existing.id);
        }
      }
      return false;
    }
    this.db.prepare(`INSERT INTO news_items (token_id, provider, external_id, published_at, fetched_at, title, url, canonical_url, domain, dedup_key, kind, promo_flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(n.tokenId, n.provider, n.externalId, n.publishedAt, nowS(), n.title, n.url, n.canonicalUrl, n.domain, n.dedupKey, n.kind, JSON.stringify(n.promoFlags));
    return true;
  }
  domainFirstSeen(domain: string): number | null {
    const r = this.db.prepare('SELECT MIN(fetched_at) AS m FROM news_items WHERE domain = ?').get(domain) as { m: number | null };
    return r.m;
  }
  domainTokenCount(domain: string): number {
    return (this.db.prepare('SELECT COUNT(DISTINCT token_id) AS n FROM news_items WHERE domain = ?').get(domain) as { n: number }).n;
  }
  counts(tokenId: number): { news: number; promo: number } {
    const r = this.db.prepare(`SELECT SUM(CASE WHEN kind = 'promo' THEN 1 ELSE 0 END) AS promo, SUM(CASE WHEN kind != 'promo' THEN 1 ELSE 0 END) AS news FROM news_items WHERE token_id = ?`).get(tokenId) as { news: number | null; promo: number | null };
    return { news: r.news ?? 0, promo: r.promo ?? 0 };
  }
}
