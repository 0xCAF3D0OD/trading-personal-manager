import type { ClaimDraft, ClaimType, ExtractedNumber, VerificationKind } from '@tpm/shared';
import { extractNumbers, normalizeWhitespace } from './numbers.js';

const SUBTYPES: [string, RegExp][] = [
  ['lp_lock', /\b(lp|liquidit)\w*\s+(lock|verrou|burn)/i],
  ['burn', /\b(burn|br[uû]l|incinerat)/i],
  ['tax', /\b(tax|taxe|taxes|fee|fees|frais)\b/i],
  ['redistribution', /(redistribu|reward|r[ée]compense|dividend|reflection)/i],
  ['airdrop', /airdrop/i],
  ['vesting', /vesting|cliff|unlock/i],
  ['buyback', /buy ?back|rachat/i],
  ['listing', /\b(list(ing|ed)?|cotation|cot[ée])\b/i],
];
const TYPE_RULES: [ClaimType, RegExp][] = [
  ['listing', /\b(list(ing|ed)?|exchange|kraken|binance|coinbase|bybit|okx|perp)\b/i],
  ['tokenomics', /(tax|taxe|fee|frais|burn|br[uû]l|supply|offre|redistribu|reward|r[ée]compense|airdrop|vesting|\blp\b|liquidit|buyback|rachat|apy|staking)/i],
  ['partnership', /(partner|partenari|collab|integrat|int[ée]gr)/i],
  ['governance', /(governance|gouvernance|vote|\bdao\b|proposal|proposition)/i],
  ['product', /(launch|lancement|release|version|\bapp\b|beta|mainnet|feature|fonctionnalit|dapp|wallet|\bbot\b)/i],
];
const MONTHS: [string, number][] = [
  ['janv', 0], ['jan', 0], ['fév', 1], ['fev', 1], ['feb', 1], ['mars', 2], ['mar', 2], ['avr', 3], ['apr', 3], ['mai', 4], ['may', 4], ['juin', 5], ['jun', 5],
  ['juil', 6], ['jul', 6], ['août', 7], ['aou', 7], ['aug', 7], ['sept', 8], ['sep', 8], ['oct', 9], ['nov', 10], ['déc', 11], ['dec', 11],
];
const MONTH_RE = 'jan\\w*|f[ée]v\\w*|feb\\w*|mars|mar\\w*|avr\\w*|apr\\w*|mai|may|juin|jun\\w*|juil\\w*|jul\\w*|ao[uû]t|aug\\w*|sep\\w*|oct\\w*|nov\\w*|d[ée]c\\w*';

/** Échéance déduite du texte : date explicite ou délai relatif. Proposition, jamais imposée. */
export function extractDueAt(text: string, publishedAt: number): number | null {
  const t = text.toLowerCase();
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return Math.floor(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 23, 59) / 1000);
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH_RE})(?:\\s+(\\d{4}))?`).exec(t);
  const monthFirst = new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:er|st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`).exec(t);
  const hit = dayFirst ?? monthFirst;
  if (hit) {
    const day = Number(dayFirst ? hit[1] : hit[2]);
    const monKey = (dayFirst ? hit[2] : hit[1]) ?? '';
    const mon = MONTHS.find(([k]) => monKey.startsWith(k))?.[1];
    if (mon !== undefined && day >= 1 && day <= 31) {
      const pub = new Date(publishedAt * 1000);
      const year = hit[3] ? Number(hit[3]) : pub.getUTCFullYear();
      let due = Date.UTC(year, mon, day, 23, 59);
      if (!hit[3] && due < publishedAt * 1000) due = Date.UTC(year + 1, mon, day, 23, 59);
      return Math.floor(due / 1000);
    }
  }
  const rel = /(?:within|in|d'ici|dans|sous|under)\s+(\d{1,3})\s*(h\b|hours?|heures?|days?|jours?|j\b|weeks?|semaines?|months?|mois)/.exec(t);
  if (rel) {
    const n = Number(rel[1]); const u = rel[2] ?? '';
    const secs = /^h/.test(u) ? 3600 : /^(d|j)/.test(u) ? 86400 : /^(w|s)/.test(u) ? 7 * 86400 : 30 * 86400;
    return publishedAt + n * secs;
  }
  if (/(fin de semaine|end of (the )?week|\beow\b)/.test(t)) return publishedAt + 7 * 86400;
  if (/(fin du mois|end of (the )?month|\beom\b)/.test(t)) return publishedAt + 30 * 86400;
  return null;
}

export function draftFromText(text: string, publishedAt: number, extra: { url?: string | null; author?: string | null } = {}): ClaimDraft {
  const clean = normalizeWhitespace(text);
  const subtype = SUBTYPES.find(([, re]) => re.test(clean))?.[0] ?? null;
  const type = TYPE_RULES.find(([, re]) => re.test(clean))?.[0] ?? 'other';
  const numbers: ExtractedNumber[] = extractNumbers(clean).map((n) => ({
    value: n.value, unit: n.unit, raw: n.raw, context: clean.slice(Math.max(0, n.index - 40), Math.min(clean.length, n.index + n.raw.length + 40)),
  }));
  let verificationKind: VerificationKind | null = null;
  if (subtype === 'burn') verificationKind = 'supply_decrease';
  else if (subtype === 'lp_lock') verificationKind = 'lp_lock';
  else if (type === 'tokenomics') verificationKind = 'page_content';
  return { text: clean, publishedAt, url: extra.url ?? null, author: extra.author ?? null, type, subtype, dueAt: extractDueAt(clean, publishedAt), extractedNumbers: numbers, verificationKind };
}

/** Analyse de la réponse oEmbed officielle de X : texte intégral, auteur, date. */
export function parseOembed(o: { html: string; author_name?: string; author_url?: string; url?: string }): { text: string; author: string | null; publishedAt: number | null; url: string | null } {
  const html = o.html ?? '';
  const p = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const text = decodeEntities((p?.[1] ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
  const dateMatch = /<a href="https?:\/\/(?:twitter|x)\.com\/[^"]+\/status\/\d+[^"]*">([^<]+)<\/a>\s*<\/blockquote>/i.exec(html);
  let publishedAt: number | null = null;
  if (dateMatch?.[1]) {
    const d = new Date(dateMatch[1]);
    if (!Number.isNaN(d.getTime())) publishedAt = Math.floor(d.getTime() / 1000);
  }
  const handle = /(?:twitter|x)\.com\/([A-Za-z0-9_]+)/.exec(o.author_url ?? '');
  const author = o.author_name ? `${o.author_name}${handle ? ` (@${handle[1]})` : ''}` : null;
  return { text, author, publishedAt, url: o.url ?? null };
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '’').replace(/&#x27;/g, '’').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Un texte mentionne-t-il un changement numérique donné, ou partage-t-il au moins deux mots-clés ? */
export function textMentionsChange(text: string, change: { beforeValue: number | null; afterValue: number | null; unit: string | null; keywords: string[] }): boolean {
  const t = text.toLowerCase();
  const nums = extractNumbers(t);
  for (const v of [change.beforeValue, change.afterValue]) {
    if (v === null) continue;
    if (nums.some((n) => Math.abs(n.value - v) < 1e-9 && (change.unit === null || n.unit === change.unit || n.unit === null))) return true;
  }
  return change.keywords.filter((k) => t.includes(k.toLowerCase())).length >= 2;
}
