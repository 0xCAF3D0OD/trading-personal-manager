import { createHash, createHmac } from 'node:crypto';
import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';

/**
 * Source Kraken en lecture seule (docs/06, parties B et C).
 * Un seul endpoint privé autorisé, `Balance` : la liste blanche ci-dessous est vérifiée par un test qui échoue si elle grandit.
 * Aucune route d'ordre, de retrait ni de ledger n'existe ici, par construction.
 */
export const KRAKEN_PRIVATE_WHITELIST: readonly string[] = Object.freeze(['Balance']);

export type KrakenState = 'staking' | 'earn_flex' | 'earn_locked' | null;
export interface KrakenBalance { krakenCode: string; asset: string; state: KrakenState; balance: number }
export interface KrakenTicker { pair: string; altname: string; base: string; quote: string; last: number | null; bid: number | null; ask: number | null }
export interface KrakenPairInfo { key: string; altname: string; wsname: string | null; base: string; quote: string }

/** Codes historiques de Kraken (préfixes X pour les cryptos, Z pour les monnaies) vers les codes courants. */
const LEGACY: Record<string, string> = {
  XXBT: 'BTC', XBT: 'BTC', XETH: 'ETH', XXDG: 'DOGE', XDG: 'DOGE', XLTC: 'LTC', XXRP: 'XRP', XXLM: 'XLM', XMLN: 'MLN', XZEC: 'ZEC', XETC: 'ETC', XREP: 'REP', XXMR: 'XMR',
  ZEUR: 'EUR', ZUSD: 'USD', ZGBP: 'GBP', ZCAD: 'CAD', ZJPY: 'JPY', ZAUD: 'AUD', ZCHF: 'CHF',
};
const STATE_BY_SUFFIX: Record<string, KrakenState> = { S: 'staking', F: 'earn_flex', B: 'earn_locked', M: 'earn_flex', P: 'earn_locked' };
export const FIAT = new Set(['EUR', 'USD', 'GBP', 'CAD', 'JPY', 'AUD', 'CHF']);

/** `SOL.S` → { asset: 'SOL', state: 'staking' } ; `XXBT` → BTC ; `ZEUR` → EUR. */
export function normalizeAsset(code: string): { asset: string; state: KrakenState } {
  const [raw, suffix] = code.trim().split('.', 2) as [string, string | undefined];
  const asset = LEGACY[raw] ?? raw;
  const state = suffix ? (STATE_BY_SUFFIX[suffix.toUpperCase()] ?? 'earn_locked') : null;
  return { asset, state };
}

/**
 * Signature Kraken : HMAC-SHA512( path + SHA256(nonce + postdata), base64(secret) ), en base64.
 * Fonction pure, testée contre l'exemple de la documentation Kraken.
 */
export function signRequest(path: string, nonce: string, postData: string, secretB64: string): string {
  const sha = createHash('sha256').update(nonce + postData).digest();
  const hmac = createHmac('sha512', Buffer.from(secretB64, 'base64'));
  hmac.update(Buffer.concat([Buffer.from(path, 'utf8'), sha]));
  return hmac.digest('base64');
}

export function parseBalance(result: Record<string, string | number>): KrakenBalance[] {
  const out: KrakenBalance[] = [];
  for (const [code, v] of Object.entries(result ?? {})) {
    const balance = Number(v);
    if (!Number.isFinite(balance) || balance <= 0) continue;
    const { asset, state } = normalizeAsset(code);
    out.push({ krakenCode: code, asset, state, balance });
  }
  return out.sort((a, b) => a.asset.localeCompare(b.asset) || (a.state ?? '').localeCompare(b.state ?? ''));
}

export function parsePairs(result: Record<string, { altname?: string; wsname?: string; base?: string; quote?: string }>): KrakenPairInfo[] {
  const out: KrakenPairInfo[] = [];
  for (const [key, p] of Object.entries(result ?? {})) {
    if (!p?.altname || !p.base || !p.quote) continue;
    out.push({ key, altname: p.altname, wsname: p.wsname ?? null, base: normalizeAsset(p.base).asset, quote: normalizeAsset(p.quote).asset });
  }
  return out;
}

export function parseTicker(result: Record<string, { c?: string[]; b?: string[]; a?: string[] }>, pairs: KrakenPairInfo[]): KrakenTicker[] {
  const byKey = new Map(pairs.map((p) => [p.key, p]));
  const byAlt = new Map(pairs.map((p) => [p.altname, p]));
  const out: KrakenTicker[] = [];
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  for (const [key, t] of Object.entries(result ?? {})) {
    const info = byKey.get(key) ?? byAlt.get(key);
    if (!info) continue;
    out.push({ pair: info.key, altname: info.altname, base: info.base, quote: info.quote, last: num(t?.c?.[0]), bid: num(t?.b?.[0]), ask: num(t?.a?.[0]) });
  }
  return out;
}

interface KrakenEnvelope<T> { error?: string[]; result?: T }

export class KrakenSource {
  private pairsCache: { at: number; pairs: KrakenPairInfo[] } | null = null;
  private lastNonce = 0;

  constructor(
    private readonly deps: HttpDeps,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly apiSecret: string | undefined,
  ) {}

  get configured(): boolean { return !!this.apiKey && !!this.apiSecret; }

  /** Nonce strictement croissant même si deux appels tombent dans la même milliseconde. */
  private nonce(): string {
    const n = Math.max(Date.now() * 1000, this.lastNonce + 1);
    this.lastNonce = n;
    return String(n);
  }

  /** Le seul chemin privé que ce code sait appeler. Toute autre méthode est refusée avant tout appel réseau. */
  private async privateCall<T>(method: string, params: Record<string, string> = {}): Promise<T> {
    if (!KRAKEN_PRIVATE_WHITELIST.includes(method)) throw new Error(`Kraken : méthode privée refusée par construction (${method}). Seuls ${KRAKEN_PRIVATE_WHITELIST.join(', ')} sont autorisés.`);
    if (!this.apiKey || !this.apiSecret) throw new Error('Kraken : KRAKEN_API_KEY et KRAKEN_API_SECRET absents');
    const path = `/0/private/${method}`;
    const nonce = this.nonce();
    const body = new URLSearchParams({ nonce, ...params }).toString();
    const sign = signRequest(path, nonce, body, this.apiSecret);
    const r = await fetchJson<KrakenEnvelope<T>>(this.deps, 'kraken', method, `${this.baseUrl}${path}`, {
      method: 'POST', headers: { 'API-Key': this.apiKey, 'API-Sign': sign, 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    if (r.error?.length) throw new Error(`Kraken ${method} : ${r.error.join(' ; ')}`);
    if (!r.result) throw new Error(`Kraken ${method} : réponse vide`);
    return r.result;
  }

  private async publicCall<T>(method: string, query: Record<string, string> = {}): Promise<T> {
    const q = new URLSearchParams(query).toString();
    const r = await fetchJson<KrakenEnvelope<T>>(this.deps, 'kraken', method, `${this.baseUrl}/0/public/${method}${q ? `?${q}` : ''}`, { headers: { accept: 'application/json' } });
    if (r.error?.length) throw new Error(`Kraken ${method} : ${r.error.join(' ; ')}`);
    if (!r.result) throw new Error(`Kraken ${method} : réponse vide`);
    return r.result;
  }

  /** Soldes du compte (permission « Query Funds »). Soldes nuls ignorés, codes normalisés, états conservés. */
  async balance(): Promise<KrakenBalance[]> {
    return parseBalance(await this.privateCall<Record<string, string>>('Balance'));
  }

  /** Paires publiques, en cache 24 h : sert à traduire « SOL contre EUR » en clé Kraken. */
  async pairs(): Promise<KrakenPairInfo[]> {
    const now = Date.now();
    if (this.pairsCache && now - this.pairsCache.at < 24 * 3600 * 1000) return this.pairsCache.pairs;
    const pairs = parsePairs(await this.publicCall<Record<string, { altname?: string; wsname?: string; base?: string; quote?: string }>>('AssetPairs'));
    this.pairsCache = { at: now, pairs };
    return pairs;
  }

  /** Dernier prix des paires demandées (base/quote normalisés, ex. SOL/EUR). Les paires inconnues de Kraken sont simplement absentes. */
  async tickers(wanted: { base: string; quote: string }[]): Promise<KrakenTicker[]> {
    const pairs = await this.pairs();
    const keys = wanted.map((w) => pairs.find((p) => p.base === w.base && p.quote === w.quote)?.key).filter((k): k is string => !!k);
    if (!keys.length) return [];
    const uniq = [...new Set(keys)];
    const result = await this.publicCall<Record<string, { c?: string[]; b?: string[]; a?: string[] }>>('Ticker', { pair: uniq.join(',') });
    return parseTicker(result, pairs);
  }
}
