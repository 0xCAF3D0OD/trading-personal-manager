import type { DataCapability, SourceName, SourcesView, Tier } from '@tpm/shared';
import type { Env } from '../config/env.js';
import type { UsageRepo } from '../db/repositories/usage.repo.js';
import { DexScreenerSource } from './dexscreener/dexscreener.source.js';
import { SourceHealth } from './health.js';
import { HeliusSource } from './helius/helius.source.js';
import type { HttpDeps } from './http.js';
import { JupiterPriceSource } from './jupiter/jupiter-price.source.js';
import { SolanaRpcSource } from './rpc/solana-rpc.source.js';
import { RugCheckSource } from './rugcheck/rugcheck.source.js';
import { SolscanClient } from './solscan/solscan.client.js';
import { SolscanSource } from './solscan/solscan.source.js';

/**
 * Registre des sources. Détecte le palier au démarrage :
 *  A = RPC public, B = Helius, C = Helius ou RPC + Solscan.
 * Chaque service demande ici la source à utiliser pour un type de donnée.
 */
export class DataSourceRegistry {
  readonly health = new SourceHealth();
  readonly rpc: SolanaRpcSource;
  readonly dexscreener: DexScreenerSource;
  readonly jupiter: JupiterPriceSource;
  readonly rugcheck: RugCheckSource;
  readonly helius: HeliusSource | null;
  readonly solscan: SolscanSource | null;
  readonly tier: Tier;

  constructor(private readonly env: Env, usage: UsageRepo) {
    const deps: HttpDeps = { usage, health: this.health };
    this.rpc = new SolanaRpcSource(deps, env.SOLANA_RPC_URL, env.isHelius);
    this.dexscreener = new DexScreenerSource(deps, env.DEXSCREENER_BASE_URL);
    this.jupiter = new JupiterPriceSource(deps, env.JUPITER_PRICE_URL);
    this.rugcheck = new RugCheckSource(deps, env.RUGCHECK_BASE_URL);
    this.helius = env.isHelius ? new HeliusSource(deps, env.SOLANA_RPC_URL, env.heliusApiKey, env.HELIUS_MAX_HOLDER_PAGES) : null;
    this.solscan = env.SOLSCAN_API_KEY
      ? new SolscanSource(new SolscanClient(deps, env.SOLSCAN_BASE_URL, env.SOLSCAN_API_KEY))
      : null;
    this.tier = this.solscan ? 'C' : this.helius ? 'B' : 'A';

    this.health.configure('rpc', true);
    this.health.configure('dexscreener', true);
    this.health.configure('jupiter', true);
    this.health.configure('rugcheck', true);
    this.health.configure('helius', !!this.helius);
    this.health.configure('solscan', !!this.solscan);
  }

  get canFullHolders(): boolean {
    return !!this.helius || !!this.solscan;
  }

  get holdersSource(): SourceName {
    return this.helius ? 'helius' : this.solscan ? 'solscan' : 'rpc';
  }

  get creatorActivitySource(): SourceName | null {
    if (this.helius?.enhancedAvailable) return 'helius';
    if (this.solscan) return 'solscan';
    return null;
  }

  capabilities(): DataCapability[] {
    const helius = !!this.helius;
    const solscan = !!this.solscan;
    const cap = (key: string, label: string, activeSource: SourceName, available: boolean, missingVariable: string | null): DataCapability =>
      ({ key, label, activeSource, available, missingVariable });
    return [
      cap('health', 'Santé structurelle (mint, freeze, Token-2022)', 'rpc', true, null),
      cap('supply', 'Offre et burn', 'rpc', true, null),
      cap('price', 'Prix, volume, liquidité', 'dexscreener', true, null),
      cap('price_alt', 'Prix de référence secondaire', 'jupiter', true, null),
      cap('creator', 'Créateur et date de création', 'rpc', true, null),
      cap('lp_lock', 'Liquidité verrouillée', 'rugcheck', true, null),
      cap('top20', 'Concentration top 5 / 10 / 20', 'rpc', true, null),
      cap('top100', 'Concentration top 50 / 100 et tranches', this.holdersSource, helius || solscan, helius || solscan ? null : 'SOLANA_RPC_URL (Helius)'),
      cap('holder_count', 'Nombre total de détenteurs', this.holdersSource, helius || solscan, helius || solscan ? null : 'SOLANA_RPC_URL (Helius)'),
      cap('creator_activity', 'Activités du wallet créateur', this.creatorActivitySource ?? 'unavailable', !!this.creatorActivitySource, this.creatorActivitySource ? null : 'HELIUS_API_KEY'),
      cap('solscan_usage', 'Quota Solscan distant', 'solscan', solscan, solscan ? null : 'SOLSCAN_API_KEY'),
    ];
  }

  sourcesView(): SourcesView {
    const labels: Record<Tier, string> = {
      A: 'Palier A — RPC public seul',
      B: 'Palier B — Helius (recommandé)',
      C: 'Palier C — Helius/RPC + Solscan en repli',
    };
    return { tier: this.tier, tierLabel: labels[this.tier], sources: this.health.snapshot(), capabilities: this.capabilities() };
  }
}
