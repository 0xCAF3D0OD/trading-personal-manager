import type { CreatorActivity, CreatorInfo, HoldersResult, RawHolder } from '../types.js';
import { SolscanClient, SOLSCAN_CU_PER_CALL } from './solscan.client.js';

interface SolscanMeta {
  address: string; name?: string; symbol?: string; decimals?: number; holder?: number;
  creator?: string; create_tx?: string; created_time?: number; supply?: string; price?: number; market_cap?: number;
}
interface SolscanHolderItem { address: string; amount: number | string; decimals: number; owner: string; rank: number }

/** Palier C : repli et recoupement uniquement. Chaque méthode annonce son coût en CU. */
export class SolscanSource {
  constructor(private readonly client: SolscanClient) {}

  /** 100 CU */
  async getMeta(mint: string): Promise<SolscanMeta> {
    return this.client.get<SolscanMeta>('/token/meta', { address: mint });
  }

  /** 100 CU */
  async getCreatorInfo(mint: string): Promise<CreatorInfo> {
    const m = await this.getMeta(mint);
    return {
      creator: m.creator ?? null, createdAt: m.created_time ?? null,
      name: m.name ?? null, symbol: m.symbol ?? null, source: 'solscan',
    };
  }

  /** 100 CU par page de 40. Top N détenteurs, N ≤ 100 → 3 pages max. */
  async getTopHolders(mint: string, decimals: number, topN = 100): Promise<HoldersResult> {
    const holders: RawHolder[] = [];
    const pageSize = 40;
    const pages = Math.ceil(Math.min(topN, 100) / pageSize);
    let total: number | null = null;
    for (let page = 1; page <= pages; page++) {
      const data = await this.client.get<{ total?: number; items?: SolscanHolderItem[] } | SolscanHolderItem[]>(
        '/token/holders', { address: mint, page, page_size: pageSize },
      );
      const items = Array.isArray(data) ? data : data.items ?? [];
      if (!Array.isArray(data) && typeof data.total === 'number') total = data.total;
      for (const it of items) {
        holders.push({ account: it.address, owner: it.owner ?? it.address, amount: Number(it.amount) / 10 ** (it.decimals ?? decimals) });
      }
      if (items.length < pageSize) break;
    }
    return { holders, totalHolders: total, truncated: true, source: 'solscan', cuSpent: pages * SOLSCAN_CU_PER_CALL };
  }

  /** 100 CU */
  async getHolderCount(mint: string): Promise<number | null> {
    const m = await this.getMeta(mint);
    return typeof m.holder === 'number' ? m.holder : null;
  }

  /** 100 CU */
  async getCreatorActivities(creator: string, tokenMint: string): Promise<CreatorActivity[]> {
    const data = await this.client.get<any[] | { items?: any[] }>('/account/defi/activities', {
      address: creator, page: 1, page_size: 50, token: tokenMint,
    });
    const items = Array.isArray(data) ? data : data.items ?? [];
    return items.map((it: any) => ({
      signature: String(it.trans_id ?? it.tx_hash ?? it.signature ?? ''),
      ts: Number(it.block_time ?? it.time ?? 0),
      kind: String(it.activity_type ?? 'unknown').toLowerCase(),
      description: null,
      amount: null,
      amountUsd: typeof it.value === 'number' ? it.value : null,
      involvesToken: true,
      raw: it,
    }));
  }

  /** Gratuit d'après la doc, à confirmer : consommation du quota. */
  async getUsage(): Promise<unknown> {
    return this.client.get<unknown>('/monitor/usage', {});
  }
}
