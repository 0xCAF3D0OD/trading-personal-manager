import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface JupiterQuote {
  priceImpactPct: number | null;
  outAmountUsd: number | null;
  route: string[];
}

/**
 * Cotation Jupiter : simulation de route pour une vente du token contre USDC.
 * Donne l'impact de prix réel de la route à l'instant T, pools concentrés compris.
 * N'intègre ni le MEV ni le déplacement de prix que l'ordre provoque pour les suivants.
 */
export class JupiterQuoteSource {
  constructor(private readonly deps: HttpDeps, private readonly baseUrl: string) {}

  async sellQuote(inputMint: string, amountRaw: bigint, slippageBps = 50): Promise<JupiterQuote> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/quote?inputMint=${inputMint}&outputMint=${USDC_MINT}&amount=${amountRaw.toString()}&slippageBps=${slippageBps}&swapMode=ExactIn`;
    const r = await fetchJson<any>(this.deps, 'jupiter', 'swap/quote', url);
    const impact = r?.priceImpactPct !== undefined && r?.priceImpactPct !== null ? Number(r.priceImpactPct) : null;
    const out = r?.outAmount !== undefined ? Number(r.outAmount) / 1e6 : null;
    const route: string[] = Array.isArray(r?.routePlan)
      ? r.routePlan.map((p: any) => String(p?.swapInfo?.label ?? p?.swapInfo?.ammKey ?? '?')).filter(Boolean)
      : [];
    return {
      // Jupiter renvoie une fraction (0.0123 = 1,23 %) ; on normalise en pourcentage.
      priceImpactPct: impact !== null && Number.isFinite(impact) ? impact * 100 : null,
      outAmountUsd: out !== null && Number.isFinite(out) ? out : null,
      route,
    };
  }
}
