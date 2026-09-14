import type { SourceName } from '@tpm/shared';
import { isSolanaAddress } from '@tpm/shared';
import { SYSTEM_PROGRAM } from '../datasources/rpc/solana-rpc.source.js';
import { TTL } from '../cache/ttl-policy.js';
import type { CreatorActivityRow } from '../db/repositories/creator.repo.js';
import { AppContext } from './context.js';
import type { TokenService } from './token.service.js';

export interface CreatorView {
  creatorAddress: string | null;
  available: boolean;
  missingVariable: string | null;
  source: SourceName;
  fetchedAt: number | null;
  activities: {
    signature: string; ts: number; kind: string; description: string | null; amount: number | null; amountUsd: number | null; source: string;
  }[];
}

export class CreatorService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService) {}

  async get(tokenId: number): Promise<{ value: CreatorView; cached: boolean }> {
    const token = this.tokens.require(tokenId);
    const source = this.ctx.sources.creatorActivitySource;
    // Défense en profondeur : une adresse stockée invalide ou nulle ne doit jamais atteindre Helius (HTTP 400).
    const creatorOk = !!token.creator_address && isSolanaAddress(token.creator_address) && token.creator_address !== SYSTEM_PROGRAM;
    const base: CreatorView = {
      creatorAddress: creatorOk ? token.creator_address : null, available: !!source && creatorOk,
      missingVariable: source ? null : 'HELIUS_API_KEY', source: source ?? 'unavailable', fetchedAt: null, activities: [],
    };
    if (!source || !creatorOk) return { value: { ...base, activities: this.stored(tokenId) }, cached: true };

    const creator = token.creator_address as string;
    const hit = await this.ctx.cache.getOrFetch<number>(`creator-activity:${token.id}`, TTL.creatorActivity, async () => {
      const list = source === 'helius'
        ? await this.ctx.sources.helius!.getAddressActivities(creator, token.address)
        : await this.ctx.sources.solscan!.getCreatorActivities(creator, token.address);
      const inserted = this.ctx.creator.upsertMany(
        tokenId,
        list.map((a) => ({
          tx_signature: a.signature, ts: a.ts, kind: a.kind, description: a.description,
          amount: a.amount, amount_usd: a.amountUsd, source,
          raw: JSON.stringify(a.raw).slice(0, 20_000),
        })),
      );
      return { value: inserted, source };
    });
    return { value: { ...base, fetchedAt: hit.fetchedAt, activities: this.stored(tokenId) }, cached: hit.cached };
  }

  private stored(tokenId: number): CreatorView['activities'] {
    return this.ctx.creator.list(tokenId).map((r: CreatorActivityRow) => ({
      signature: r.tx_signature, ts: r.ts, kind: r.kind, description: r.description,
      amount: r.amount, amountUsd: r.amount_usd, source: r.source,
    }));
  }
}
