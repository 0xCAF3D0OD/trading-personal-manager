import type { ScannerSettings } from '@tpm/shared';
import type { HttpDeps } from '../http.js';
import { fetchJson, HttpError } from '../http.js';

export interface GtTx { buys: number; sells: number; buyers: number; sellers: number }
export interface GtPool {
  address: string;
  dexId: string;
  name: string;
  baseToken: string;
  quoteToken: string;
  baseSymbol: string | null;
  baseName: string | null;
  poolCreatedAt: number | null;
  priceUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  reserveUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  transactions: { h1: GtTx | null; h24: GtTx | null };
}
export interface GtTokenInfo {
  address: string;
  name: string | null;
  symbol: string | null;
  websites: string[];
  hasSocials: boolean;
  description: string | null;
  holdersCount: number | null;
  top10Pct: number | null;
  mintAuthority: 'yes' | 'no' | null;
  freezeAuthority: 'yes' | 'no' | null;
  isHoneypot: string | null;
  developerAddress: string | null;
  developerHoldingPct: number | null;
  gtScore: number | null;
  /** Identifiant de la fiche CoinGecko quand le token en a une : la seule clé fiable vers ses marchés centralisés. */
  coingeckoCoinId: string | null;
}
export interface CgTicker { name: string; identifier: string; target: string; volumeUsd: number | null; trustScore: string | null; tradeUrl: string | null }
export interface GtToken { address: string; priceUsd: number | null; fdvUsd: number | null; marketCapUsd: number | null; volume24hUsd: number | null; totalReserveUsd: number | null }

export class BreakerOpenError extends Error {
  constructor(public readonly until: number) { super(`Disjoncteur GeckoTerminal ouvert jusqu’à ${new Date(until * 1000).toLocaleTimeString('fr-FR')}`); }
}

const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : null; };
const idAddr = (id: unknown): string => String(id ?? '').replace(/^solana_/, '');

/**
 * GeckoTerminal public (voie principale, sans clé, 10 appels/min annoncés) et CoinGecko démo (voie de secours, clé, 10 000 crédits/mois).
 * Même schéma de réponse. File d'attente cadencée, attente exponentielle sur 429, disjoncteur.
 */
export class GeckoTerminalSource {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly callTimes: number[] = [];
  private consecutive429 = 0;
  private breakerUntil: number | null = null;
  private laneOverride: 'geckoterminal' | 'coingecko_demo' | null = null;

  constructor(
    private readonly deps: HttpDeps,
    private readonly publicBase: string,
    private readonly demoBase: string,
    private readonly demoKey: string | undefined,
    private readonly rateCfg: () => ScannerSettings['rateLimit'],
  ) {}

  get lane(): 'geckoterminal' | 'coingecko_demo' {
    return this.laneOverride ?? 'geckoterminal';
  }
  get breaker(): { open: boolean; until: number | null; consecutive429: number } {
    const open = this.breakerUntil !== null && this.breakerUntil > Date.now() / 1000;
    return { open, until: open ? this.breakerUntil : null, consecutive429: this.consecutive429 };
  }
  get callsLastHour(): number {
    const cutoff = Date.now() - 3_600_000;
    return this.callTimes.filter((t) => t > cutoff).length;
  }

  // --- endpoints ----------------------------------------------------------------

  async newPools(page = 1): Promise<GtPool[]> {
    const r = await this.get(`/networks/solana/new_pools?page=${page}&include=base_token,quote_token,dex`, 'new_pools');
    return parsePools(r);
  }
  async trendingPools(duration: '5m' | '1h' | '6h' | '24h', page = 1): Promise<GtPool[]> {
    const r = await this.get(`/networks/solana/trending_pools?duration=${duration}&page=${page}&include=base_token,quote_token,dex`, 'trending_pools');
    return parsePools(r);
  }
  /** 30 adresses par appel sur les paliers gratuits. */
  async poolsMulti(addresses: string[]): Promise<GtPool[]> {
    const out: GtPool[] = [];
    for (let i = 0; i < addresses.length; i += 30) {
      const chunk = addresses.slice(i, i + 30);
      const r = await this.get(`/networks/solana/pools/multi/${chunk.join(',')}?include=base_token,quote_token,dex`, 'pools_multi');
      out.push(...parsePools(r));
    }
    return out;
  }
  async tokenInfo(mint: string): Promise<GtTokenInfo> {
    const r = await this.get(`/networks/solana/tokens/${mint}/info`, 'token_info');
    const a = r?.data?.attributes ?? {};
    const dist = a?.holders?.distribution_percentage ?? {};
    const yn = (v: unknown): 'yes' | 'no' | null => (v === 'yes' || v === 'no' ? v : v === true ? 'yes' : v === false ? 'no' : null);
    return {
      address: String(a.address ?? mint), name: a.name ?? null, symbol: a.symbol ?? null,
      websites: Array.isArray(a.websites) ? a.websites.map(String) : [],
      hasSocials: !!(a.twitter_handle || a.telegram_handle || a.discord_url || a.farcaster_url),
      description: typeof a.description === 'string' && a.description.trim() ? a.description : null,
      holdersCount: num(a?.holders?.count), top10Pct: num(dist.top_10),
      mintAuthority: yn(a.mint_authority), freezeAuthority: yn(a.freeze_authority),
      isHoneypot: a.is_honeypot === undefined || a.is_honeypot === null ? null : String(a.is_honeypot),
      developerAddress: typeof a.developer_address === 'string' && a.developer_address ? a.developer_address : null,
      developerHoldingPct: num(a.developer_holding_percentage), gtScore: num(a.gt_score),
      coingeckoCoinId: typeof a.coingecko_coin_id === 'string' && a.coingecko_coin_id.trim() ? a.coingecko_coin_id.trim() : null,
    };
  }
  /**
   * Marchés d'une fiche CoinGecko (API publique, hors file GeckoTerminal : autre hôte, autre limite).
   * Appelé rarement (TTL 24 h, tokens gardés seulement). Clé démo utilisée si présente.
   */
  async coinTickers(coinId: string): Promise<CgTicker[]> {
    const base = this.demoBase.replace(/\/onchain\/?$/, '');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.demoKey) headers['x-cg-demo-api-key'] = this.demoKey;
    const r = await fetchJson<any>(this.deps, 'coingecko', 'coin_tickers', `${base}/coins/${encodeURIComponent(coinId)}/tickers?include_exchange_logo=false&order=volume_desc`, { headers, cu: 1 });
    const out: CgTicker[] = [];
    for (const t of Array.isArray(r?.tickers) ? r.tickers : []) {
      const name = String(t?.market?.name ?? '').trim();
      if (!name) continue;
      out.push({ name, identifier: String(t?.market?.identifier ?? name.toLowerCase()), target: String(t?.target ?? ''), volumeUsd: num(t?.converted_volume?.usd), trustScore: typeof t?.trust_score === 'string' ? t.trust_score : null, tradeUrl: typeof t?.trade_url === 'string' ? t.trade_url : null });
    }
    return out;
  }
  async tokensMulti(mints: string[]): Promise<GtToken[]> {
    const out: GtToken[] = [];
    for (let i = 0; i < mints.length; i += 30) {
      const chunk = mints.slice(i, i + 30);
      const r = await this.get(`/networks/solana/tokens/multi/${chunk.join(',')}`, 'tokens_multi');
      for (const d of r?.data ?? []) {
        const a = d?.attributes ?? {};
        out.push({ address: String(a.address ?? idAddr(d.id)), priceUsd: num(a.price_usd), fdvUsd: num(a.fdv_usd), marketCapUsd: num(a.market_cap_usd), volume24hUsd: num(a?.volume_usd?.h24), totalReserveUsd: num(a.total_reserve_in_usd) });
      }
    }
    return out;
  }

  // --- file d'attente, cadence, repli --------------------------------------------

  private get(path: string, label: string): Promise<any> {
    const run = async (): Promise<any> => {
      const cfg = this.rateCfg();
      const nowS = Date.now() / 1000;
      if (this.breakerUntil !== null && this.breakerUntil > nowS) {
        if (this.demoKey) this.laneOverride = 'coingecko_demo';
        else throw new BreakerOpenError(this.breakerUntil);
      } else if (this.laneOverride === 'coingecko_demo' && this.breakerUntil !== null && this.breakerUntil <= nowS) {
        this.laneOverride = null;
        this.breakerUntil = null;
      }
      await this.throttle(cfg.callsPerMinute);
      let backoff = 2_000;
      for (;;) {
        try {
          const res = await this.fetchLane(path, label);
          this.consecutive429 = 0;
          return res;
        } catch (err) {
          if (!(err instanceof HttpError) || err.status !== 429) throw err;
          this.consecutive429++;
          if (this.consecutive429 >= cfg.breakerAfterConsecutive429) {
            this.breakerUntil = Date.now() / 1000 + cfg.breakerPauseS;
            if (this.demoKey && this.lane !== 'coingecko_demo') { this.laneOverride = 'coingecko_demo'; this.consecutive429 = 0; continue; }
            throw new BreakerOpenError(this.breakerUntil);
          }
          await new Promise((r) => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, cfg.maxBackoffMs);
        }
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  private async throttle(perMinute: number): Promise<void> {
    const now = Date.now();
    // On garde une heure d'historique (compteur affiché) ; la cadence se juge sur la dernière minute.
    while (this.callTimes.length && this.callTimes[0]! < now - 3_600_000) this.callTimes.shift();
    const recent = this.callTimes.filter((t) => t > now - 60_000);
    if (recent.length >= perMinute) {
      const wait = recent[0]! + 60_000 - now + 50;
      await new Promise((r) => setTimeout(r, wait));
    }
    this.callTimes.push(Date.now());
  }

  private fetchLane(path: string, label: string): Promise<any> {
    if (this.lane === 'coingecko_demo' && this.demoKey) {
      return fetchJson<any>(this.deps, 'coingecko', label, `${this.demoBase}${path}`, { headers: { 'x-cg-demo-api-key': this.demoKey, accept: 'application/json' }, cu: 1 });
    }
    return fetchJson<any>(this.deps, 'geckoterminal', label, `${this.publicBase}${path}`, { headers: { accept: 'application/json;version=20230302' } });
  }
}

export function parsePools(r: any): GtPool[] {
  const included = new Map<string, any>();
  for (const inc of r?.included ?? []) included.set(String(inc.id), inc);
  const out: GtPool[] = [];
  for (const d of r?.data ?? []) {
    const a = d?.attributes ?? {};
    const baseId = d?.relationships?.base_token?.data?.id;
    const quoteId = d?.relationships?.quote_token?.data?.id;
    const base = included.get(String(baseId))?.attributes;
    const tx = (k: string): GtTx | null => {
      const t = a?.transactions?.[k];
      return t ? { buys: num(t.buys) ?? 0, sells: num(t.sells) ?? 0, buyers: num(t.buyers) ?? 0, sellers: num(t.sellers) ?? 0 } : null;
    };
    const created = a.pool_created_at ? Math.floor(new Date(a.pool_created_at).getTime() / 1000) : null;
    out.push({
      address: String(a.address ?? idAddr(d.id)), dexId: String(d?.relationships?.dex?.data?.id ?? 'unknown'), name: String(a.name ?? ''),
      baseToken: idAddr(baseId), quoteToken: idAddr(quoteId), baseSymbol: base?.symbol ?? null, baseName: base?.name ?? null,
      poolCreatedAt: created && Number.isFinite(created) ? created : null,
      priceUsd: num(a.base_token_price_usd), fdvUsd: num(a.fdv_usd), marketCapUsd: num(a.market_cap_usd), reserveUsd: num(a.reserve_in_usd),
      priceChange: { m5: num(a?.price_change_percentage?.m5), h1: num(a?.price_change_percentage?.h1), h6: num(a?.price_change_percentage?.h6), h24: num(a?.price_change_percentage?.h24) },
      volume: { m5: num(a?.volume_usd?.m5), h1: num(a?.volume_usd?.h1), h6: num(a?.volume_usd?.h6), h24: num(a?.volume_usd?.h24) },
      transactions: { h1: tx('h1'), h24: tx('h24') },
    });
  }
  return out;
}
