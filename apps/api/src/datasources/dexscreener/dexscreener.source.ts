import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';
import type { PairInfo } from '../types.js';

interface DsPair {
  chainId: string; dexId: string; url?: string; pairAddress: string;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken: { address: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number; m5?: number };
  liquidity?: { usd?: number };
  fdv?: number; marketCap?: number; pairCreatedAt?: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export class DexScreenerSource {
  constructor(private readonly deps: HttpDeps, private readonly baseUrl: string) {}

  /** Jusqu'à 30 adresses par appel. Renvoie, par mint, la paire la plus liquide. */
  async getPairs(mints: string[]): Promise<Map<string, PairInfo | null>> {
    const all = await this.getAllPairs(mints);
    const out = new Map<string, PairInfo | null>();
    for (const mint of mints) out.set(mint, all.get(mint)?.[0] ?? null);
    return out;
  }

  /**
   * Toutes les paires de chaque mint, triées par liquidité décroissante : sert à mesurer la fragmentation.
   * `tokens/v1` ne renvoie que la meilleure paire par token : il faut `token-pairs/v1` (jusqu'à 30 pools), un appel par mint.
   * La liste de surveillance est personnelle (quelques tokens) : un appel par token reste loin de la limite DexScreener.
   */
  async getAllPairs(mints: string[]): Promise<Map<string, PairInfo[]>> {
    const out = new Map<string, PairInfo[]>();
    for (const mint of mints) {
      let list: DsPair[] = [];
      try {
        const r = await fetchJson<DsPair[] | { pairs?: DsPair[] }>(this.deps, 'dexscreener', 'token-pairs/v1', `${this.baseUrl}/token-pairs/v1/solana/${mint}`);
        list = Array.isArray(r) ? r : r?.pairs ?? [];
      } catch (err) {
        // Repli : la meilleure paire seule, pour ne pas perdre le prix si l'endpoint détaillé est indisponible.
        const r = await fetchJson<DsPair[] | { pairs?: DsPair[] }>(this.deps, 'dexscreener', 'tokens/v1', `${this.baseUrl}/tokens/v1/solana/${mint}`);
        list = Array.isArray(r) ? r : r?.pairs ?? [];
        void err;
      }
      const candidates = list.filter((p) => p.chainId === 'solana' && p.baseToken?.address === mint);
      candidates.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      out.set(mint, candidates.map(toPairInfo));
    }
    return out;
  }
}

function toPairInfo(p: DsPair): PairInfo {
  return {
    dexId: p.dexId, pairAddress: p.pairAddress, url: p.url ?? null,
    priceUsd: num(p.priceUsd),
    priceChange: { m5: num(p.priceChange?.m5), h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) },
    volume24hUsd: num(p.volume?.h24), volumeM5Usd: num(p.volume?.m5), liquidityUsd: num(p.liquidity?.usd),
    fdvUsd: num(p.fdv), marketCapUsd: num(p.marketCap),
    pairCreatedAt: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : null,
    baseSymbol: p.baseToken?.symbol ?? null, baseName: p.baseToken?.name ?? null,
  };
}
