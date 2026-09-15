import type { MarketSettings, TokenSummary, UiSettings } from '@tpm/shared';
import type { PairInfo } from '../datasources/types.js';
import { isSolanaAddress } from '@tpm/shared';
import { SYSTEM_PROGRAM } from '../datasources/rpc/solana-rpc.source.js';
import { nowS } from '../db/client.js';
import { liquidityBand } from '../market/metrics.js';
import { buildSummary, type SummaryInputs } from '../summary/build.js';
import { AppContext } from './context.js';
import type { DivergenceService } from './divergence.service.js';
import type { SettingsService } from './settings.service.js';
import type { TokenService } from './token.service.js';

/** Synthèse en cinq questions, calculée uniquement sur ce qui est déjà en base : jamais d'appel réseau ici. */
export class SummaryService {
  constructor(
    private readonly ctx: AppContext,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
    private readonly divergences: DivergenceService,
  ) {}

  get(tokenId: number): TokenSummary {
    const token = this.tokens.require(tokenId);
    const ui = this.settings.get<UiSettings>('ui');
    const marketCfg = this.settings.get<MarketSettings>('market');
    const now = nowS();

    const h = this.ctx.health.get(tokenId);
    // Même seuil que la carte Santé structurelle : moins de 7 jours = trop jeune pour un historique.
    const ageDays = token.created_at ? Math.floor((now - token.created_at) / 86400) : null;
    let extensions: string[] = [];
    try { extensions = h ? (JSON.parse(h.token2022_extensions) as string[]) : []; } catch { extensions = []; }

    const m = this.ctx.snapshots.latestMarket(tokenId);
    // Question 2 : l'état est porté par le pool principal (une route de vente ne traverse pas tous les pools) ; le total est dit à côté.
    const ratio = m && m.liquidityUsd !== null && m.marketCapUsd ? (m.liquidityUsd / m.marketCapUsd) * 100 : null;
    const band = liquidityBand(ratio, marketCfg.liquidityBands);
    const liqAll = m ? (m.liquidityTotalUsd ?? m.liquidityUsd) : null;
    const totalRatio = m && liqAll !== null && m.marketCapUsd ? (liqAll / m.marketCapUsd) * 100 : null;
    const totalBand = liquidityBand(totalRatio, marketCfg.liquidityBands);
    // Variation 24 h : la même paire, au même instant, que la carte Prix (dernier relevé DexScreener en cache), sinon le dernier snapshot.
    const livePairs = this.ctx.cache.peekStale<PairInfo[]>(`ds:pairs:${token.address}`);
    const livePair = livePairs?.value?.[0] ?? null;

    const slips = this.ctx.snapshots.slippageHistory(tokenId, now - 7 * 86400);
    const slip = [...slips].reverse().find((x) => x.orderUsd === ui.summarySlippageOrderUsd) ?? [...slips].reverse()[0] ?? null;

    const latestHolders = this.ctx.snapshots.latestHolder(tokenId);
    const fullTierMissing = this.ctx.sources.canFullHolders ? null : 'SOLANA_RPC_URL (URL Helius)';

    const creatorKnown = !!token.creator_address && isSolanaAddress(token.creator_address) && token.creator_address !== SYSTEM_PROGRAM;
    const wallets = this.ctx.team.wallets(tokenId).filter((w) => isSolanaAddress(w.address) && w.address !== SYSTEM_PROGRAM);
    const actions = this.ctx.team.actions(tokenId, now - 30 * 86400, 1000);
    const claims = this.ctx.claims.list(tokenId);
    const count = (s: string) => claims.filter((c) => c.status === s).length;

    const divs = this.divergences.compute(tokenId);

    const inputs: SummaryInputs = {
      health: h ? { mintAuthority: h.mint_authority, freezeAuthority: h.freeze_authority, extensions, checkedAt: h.checked_at, ageDays, young: ageDays !== null && ageDays < 7, lpLocked: h.lp_locked === null ? null : h.lp_locked === 1, lpLockedPct: h.lp_locked_pct, lpLockProtocol: h.lp_lock_protocol } : null,
      liquidity: m ? { ratioPct: ratio, band: band.band, mainPoolUsd: m.liquidityUsd, totalRatioPct: totalRatio, totalBand: totalBand.band, totalUsd: liqAll, poolsCount: m.poolsCount ?? (m.liquidityUsd !== null ? 1 : 0), ts: m.ts, source: m.liquiditySource ?? m.priceSource } : null,
      slippage: slip ? { orderUsd: slip.orderUsd, impactPct: slip.impactPct, ts: slip.ts } : null,
      holders: latestHolders ? { top10Pct: latestHolders.top10Pct, holderCount: latestHolders.holderCount, truncated: latestHolders.truncated, ts: latestHolders.ts, source: latestHolders.source, fullTierMissing, ageDays } : null,
      team: {
        creatorKnown: creatorKnown || wallets.some((w) => w.label === 'creator'), walletsCount: wallets.length,
        actionsAvailable: !!this.ctx.sources.helius?.enhancedAvailable,
        sells: actions.filter((a) => a.kind === 'swap_sell').length,
        transfersOut: actions.filter((a) => a.kind === 'transfer_out').length,
        lpRemovals: actions.filter((a) => a.kind === 'lp_remove').length,
        lastActionTs: actions[0]?.ts ?? null,
        claimsKept: count('kept'), claimsContradicted: count('contradicted'), claimsExpired: count('expired'), claimsPending: count('pending'),
      },
      divergences: {
        triggered: divs.filter((d) => d.status === 'triggered').map((d) => d.label),
        evaluated: divs.length, insufficient: divs.filter((d) => d.status === 'insufficient_data').length,
        computedAt: divs[0]?.computedAt ?? null,
        priceChange24hPct: livePair?.priceChange.h24 ?? m?.pctH24 ?? null,
        priceChangeAt: livePair ? livePairs!.fetchedAt : m?.ts ?? null,
      },
    };
    return { tokenId, answers: buildSummary(inputs, ui), computedAt: now };
  }

  /** Pour la liste de surveillance en lecture simple : une synthèse par token actif. */
  all(): Record<number, TokenSummary> {
    const out: Record<number, TokenSummary> = {};
    for (const t of this.ctx.tokens.listActive()) {
      try { out[t.id] = this.get(t.id); } catch (err) { this.ctx.log.warn({ err: (err as Error).message, tokenId: t.id }, 'Synthèse impossible'); }
    }
    return out;
  }
}
