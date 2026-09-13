import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';
import type { PairInfo } from '../types.js';

interface DsPair {
  chainId: string; dexId: string; url?: string; pairAddress: string;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken: { address: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number; marketCap?: number; pairCreatedAt?: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export class DexScreenerSource {
  constructor(private readonly deps: HttpDeps, private readonly baseUrl: string) {}

  /** Jusqu'à 30 adresses par appel. Renvoie, par mint, la paire la plus liquide. */
  async getPairs(mints: string[]): Promise<Map<string, PairInfo | null>> {
    const out = new Map<string, PairInfo | null>();
    for (let i = 0; i < mints.length; i += 30) {
      const chunk = mints.slice(i, i + 30);
      const pairs = await fetchJson<DsPair[] | { pairs?: DsPair[] }>(
        this.deps, 'dexscreener', 'tokens/v1', `${this.baseUrl}/tokens/v1/solana/${chunk.join(',')}`,
      );
      const list = Array.isArray(pairs) ? pairs : pairs?.pairs ?? [];
      for (const mint of chunk) {
        const candidates = list.filter((p) => p.chainId === 'solana' && p.baseToken?.address === mint);
        candidates.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
        const best = candidates[0];
        out.set(mint, best ? toPairInfo(best) : null);
      }
    }
    return out;
  }
}

function toPairInfo(p: DsPair): PairInfo {
  return {
    dexId: p.dexId, pairAddress: p.pairAddress, url: p.url ?? null,
    priceUsd: num(p.priceUsd),
    priceChange: { m5: num(p.priceChange?.m5), h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) },
    volume24hUsd: num(p.volume?.h24), liquidityUsd: num(p.liquidity?.usd),
    fdvUsd: num(p.fdv), marketCapUsd: num(p.marketCap),
    pairCreatedAt: p.pairCreatedAt ? Math.floor(p.pairCreatedAt / 1000) : null,
    baseSymbol: p.baseToken?.symbol ?? null, baseName: p.baseToken?.name ?? null,
  };
}
