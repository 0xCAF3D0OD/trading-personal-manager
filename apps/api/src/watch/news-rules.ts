import { createHash } from 'node:crypto';

const TRACKING = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'igshid', 's', 'si']);
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'for', 'is', 'le', 'la', 'les', 'de', 'des', 'du', 'et', 'en', 'un', 'une', 'au', 'aux', 'with', 'by', 'as', 'its', 'sur']);

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.protocol = 'https:';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.has(k.toLowerCase())) u.searchParams.delete(k);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return url.trim();
  }
}

export function domainOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'inconnu'; }
}

/** Titre sans accents (décomposition Unicode puis retrait des diacritiques U+0300–U+036F), sans ponctuation ni mots vides. */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');
}

/** Clé de dédoublonnage : URL canonique si elle n'est pas un redirecteur d'agrégateur, sinon titre normalisé. */
export function dedupKey(title: string, canonical: string): string {
  const d = domainOf(canonical);
  const isRedirector = /(news\.google\.com|cryptopanic\.com|feedproxy|t\.co|bit\.ly)/.test(d);
  const basis = isRedirector ? `t:${normalizeTitle(title)}` : `u:${canonical}`;
  return createHash('sha1').update(basis).digest('hex');
}

export interface NewsInput { title: string; url: string; content?: string | null; symbol: string | null; tokenAgeDays: number | null; domainFirstSeenDaysAgo: number | null; domainTokenCount: number }
export interface NewsSettings { prWireDomains: string[]; sponsoredPatterns: string[]; pricePredictionMaxTokenAgeDays: number }

export function classifyNews(n: NewsInput, s: NewsSettings): { kind: 'news' | 'listing' | 'promo'; promoFlags: { code: string; detail: string }[] } {
  const flags: { code: string; detail: string }[] = [];
  const title = n.title.toLowerCase();
  const body = `${title} ${(n.content ?? '').toLowerCase()}`;
  const canonical = canonicalUrl(n.url).toLowerCase();
  const domain = domainOf(n.url);
  const year = new Date().getUTCFullYear();
  let hasFutureYear = false;
  for (const m of `${title} ${canonical}`.matchAll(/\b(20\d{2})\b/g)) if (Number(m[1]) >= year + 1) hasFutureYear = true;
  if (/(price prediction|pr[ée]diction de prix|forecast|price target|pr[ée]vision de prix)/.test(`${title} ${canonical}`) && hasFutureYear
    && (n.tokenAgeDays === null || n.tokenAgeDays < s.pricePredictionMaxTokenAgeDays)) {
    flags.push({ code: 'price_prediction', detail: 'Prédiction de prix pluriannuelle sur un token récent : format typique du contenu SEO commandé.' });
  }
  const wire = s.prWireDomains.find((d) => d.includes('/') ? canonical.includes(d.toLowerCase()) : domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`));
  if (wire) flags.push({ code: 'pr_wire', detail: `Fil de communiqués payants : ${wire}` });
  const sponsored = s.sponsoredPatterns.find((p) => body.includes(p.toLowerCase()));
  if (sponsored) flags.push({ code: 'sponsored_mention', detail: `Mention « ${sponsored} » dans le contenu` });
  if (n.domainFirstSeenDaysAgo !== null && n.domainFirstSeenDaysAgo < 30 && n.domainTokenCount >= 3) {
    flags.push({ code: 'young_multi_token_domain', detail: `Domaine apparu il y a ${n.domainFirstSeenDaysAgo} j et déjà présent sur ${n.domainTokenCount} tokens suivis` });
  }
  if (flags.length) return { kind: 'promo', promoFlags: flags };
  const sym = n.symbol ? n.symbol.toLowerCase() : null;
  const listing = /\b(lists?|listing|listed|will list|now available on|perpetual|perp|futures|cotation|list[ée]s? sur)\b/.test(title) && (!sym || title.includes(sym));
  return { kind: listing ? 'listing' : 'news', promoFlags: [] };
}
