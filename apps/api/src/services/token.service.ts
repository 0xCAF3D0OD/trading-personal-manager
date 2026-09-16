import { isSolanaAddress, type Token, type WatchlistItem } from '@tpm/shared';
import { TTL } from '../cache/ttl-policy.js';
import type { TokenRow } from '../db/repositories/tokens.repo.js';
import { toToken } from '../db/repositories/tokens.repo.js';
import { nowS } from '../db/client.js';
import type { CreatorInfo, MintInfo } from '../datasources/types.js';
import { AppContext, NotFoundError, ValidationError } from './context.js';

export class TokenService {
  constructor(private readonly ctx: AppContext) {}

  list(): WatchlistItem[] {
    const rows = this.ctx.tokens.listActive();
    const markets = this.ctx.snapshots.latestMarketForAll();
    const holderTs = this.ctx.snapshots.latestHolderTsForAll();
    const now = nowS();
    return rows.map((r) => {
      const m = markets.get(r.id) ?? null;
      return {
        ...toToken(r),
        priceUsd: m?.priceUsd ?? null,
        priceSource: m?.priceSource ?? null,
        priceChange24hPct: m?.pctH24 ?? null,
        marketCapUsd: m?.marketCapUsd ?? null,
        volume24hUsd: m?.volume24hUsd ?? null,
        ageDays: r.created_at ? Math.floor((now - r.created_at) / 86400) : null,
        lastMarketTs: m?.ts ?? null,
        lastHolderTs: holderTs.get(r.id) ?? null,
      };
    });
  }

  require(id: number): TokenRow {
    const row = this.ctx.tokens.byId(id);
    if (!row || row.archived_at) throw new NotFoundError(`Token ${id} introuvable`);
    return row;
  }

  async getMintInfo(address: string): Promise<{ value: MintInfo; fetchedAt: number; cached: boolean }> {
    const hit = await this.ctx.cache.getOrFetch<MintInfo>(`rpc:mint:${address}`, TTL.tokenMeta, async () => ({
      value: await this.ctx.sources.rpc.getMintInfo(address),
      source: 'rpc',
    }));
    return { value: hit.value, fetchedAt: hit.fetchedAt, cached: hit.cached };
  }

  /** Créateur / date : RPC (Metaplex + signatures) d'abord, Solscan en repli, mis en cache un an. */
  async resolveCreator(address: string): Promise<CreatorInfo> {
    const hit = await this.ctx.cache.getOrFetch<CreatorInfo>(`creator:${address}`, TTL.immutable, async () => {
      let info: CreatorInfo | null = null;
      try {
        info = await this.ctx.sources.rpc.getCreatorInfo(address);
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message, address }, 'Résolution créateur via RPC échouée');
      }
      const incomplete = !info || !info.creator || !info.createdAt;
      if (incomplete && this.ctx.sources.solscan) {
        try {
          const s = await this.ctx.sources.solscan.getCreatorInfo(address);
          info = {
            creator: info?.creator ?? s.creator,
            createdAt: info?.createdAt ?? s.createdAt,
            name: info?.name ?? s.name,
            symbol: info?.symbol ?? s.symbol,
            source: info?.creator && info?.createdAt ? 'rpc' : 'solscan',
          };
        } catch (err) {
          this.ctx.log.warn({ err: (err as Error).message, address }, 'Repli Solscan créateur échoué');
        }
      }
      if (!info) info = { creator: null, createdAt: null, name: null, symbol: null, source: 'unavailable' };
      return { value: info, source: info.source };
    });
    // Si incomplet, on ne garde que 24 h pour retenter (getOrFetch aurait mis un an) : le repli « première transaction » doit pouvoir s'exécuter.
    if (!hit.cached && (!hit.value.creator || !hit.value.createdAt)) {
      this.ctx.cache.set(`creator:${address}`, hit.value, hit.value.source, nowS(), TTL.tokenMeta);
    }
    return hit.value;
  }

  async add(addressInput: string): Promise<Token> {
    const address = addressInput.trim();
    if (!isSolanaAddress(address)) throw new ValidationError('Adresse Solana invalide (base58, 32 octets attendus).');
    const existing = this.ctx.tokens.byAddress(address);
    if (existing && !existing.archived_at) throw new ValidationError('Ce token est déjà dans la liste.');

    const mint = (await this.getMintInfo(address)).value;
    const creator = await this.resolveCreator(address);
    let symbol = creator.symbol;
    let name = creator.name;
    if (!symbol || !name) {
      try {
        const pair = (await this.ctx.sources.dexscreener.getPairs([address])).get(address);
        symbol = symbol ?? pair?.baseSymbol ?? null;
        name = name ?? pair?.baseName ?? null;
      } catch { /* non bloquant */ }
    }

    if (existing) {
      this.ctx.tokens.unarchive(existing.id);
      this.ctx.tokens.updateMeta(existing.id, { symbol, name });
      return toToken(this.ctx.tokens.byId(existing.id) as TokenRow);
    }
    const row = this.ctx.tokens.insert({
      address, symbol, name, decimals: mint.decimals, program: mint.program,
      createdAt: creator.createdAt, createdAtSource: creator.createdAt ? creator.source : null,
      creatorAddress: creator.creator, creatorSource: creator.creator ? creator.source : null,
    });
    return toToken(row);
  }

  remove(id: number): void {
    if (!this.ctx.tokens.archive(id)) throw new NotFoundError(`Token ${id} introuvable`);
  }

  reorder(ids: number[]): void {
    const active = new Set(this.ctx.tokens.listActive().map((t) => t.id));
    for (const id of ids) if (!active.has(id)) throw new ValidationError(`Token ${id} inconnu dans la liste.`);
    this.ctx.tokens.reorder(ids);
  }
}
