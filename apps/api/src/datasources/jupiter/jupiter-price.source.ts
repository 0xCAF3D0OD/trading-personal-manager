import type { HttpDeps } from '../http.js';
import { fetchJson } from '../http.js';

export class JupiterPriceSource {
  constructor(private readonly deps: HttpDeps, private readonly priceUrl: string) {}

  /** Prix de référence agrégateur. Compatible v3 ({mint: {usdPrice}}) et v2 ({data: {mint: {price}}}). */
  async getPrices(mints: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    for (let i = 0; i < mints.length; i += 50) {
      const chunk = mints.slice(i, i + 50);
      const sep = this.priceUrl.includes('?') ? '&' : '?';
      const res = await fetchJson<any>(this.deps, 'jupiter', 'price', `${this.priceUrl}${sep}ids=${chunk.join(',')}`);
      const table = res?.data && typeof res.data === 'object' ? res.data : res;
      for (const mint of chunk) {
        const entry = table?.[mint];
        const raw = entry?.usdPrice ?? entry?.price ?? null;
        const n = raw === null || raw === undefined ? null : Number(raw);
        out.set(mint, n !== null && Number.isFinite(n) ? n : null);
      }
    }
    return out;
  }
}
