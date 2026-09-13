import type { CreateTeamWalletInput, OnchainAction, SupplyEvent, TeamWallet, WatchSettings } from '@tpm/shared';
import { isSolanaAddress } from '@tpm/shared';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowS } from '../../db/client.js';
import { classifyHeliusTx } from '../../watch/onchain-classify.js';
import type { AlertService } from '../alert.service.js';
import { AppContext, NotFoundError, ValidationError } from '../context.js';
import type { SettingsService } from '../settings.service.js';
import type { TokenService } from '../token.service.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Actions on-chain des wallets équipe et variations d'offre : la source la plus fiable de la veille. */
export class OnchainWatchService {
  constructor(
    private readonly ctx: AppContext,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
    private readonly alerts: AlertService,
  ) {
    this.seedLabels();
  }

  private get cfg(): WatchSettings { return this.settings.get<WatchSettings>('watch'); }

  /** Étiquettes d'adresses amorcées depuis un fichier livré avec l'application, complétées à la main ou via Solscan. */
  private seedLabels(): void {
    if (this.ctx.team.labelCount() > 0) return;
    try {
      const raw = readFileSync(join(here, '..', '..', 'seed', 'address-labels.json'), 'utf8');
      const list = JSON.parse(raw) as { address: string; label: string }[];
      for (const l of list) if (isSolanaAddress(l.address)) this.ctx.team.upsertLabel(l.address, l.label, 'seed');
    } catch (err) {
      this.ctx.log.warn({ err: (err as Error).message }, 'Fichier d’étiquettes d’adresses absent ou illisible');
    }
  }

  wallets(tokenId: number): TeamWallet[] {
    const t = this.tokens.require(tokenId);
    if (t.creator_address) this.ctx.team.ensureWallet(tokenId, t.creator_address, 'creator', 'auto', 'Créateur résolu automatiquement');
    return this.ctx.team.wallets(tokenId);
  }

  addWallet(tokenId: number, input: CreateTeamWalletInput): TeamWallet[] {
    this.tokens.require(tokenId);
    if (!isSolanaAddress(input.address)) throw new ValidationError('Adresse Solana invalide.');
    this.ctx.team.ensureWallet(tokenId, input.address.trim(), input.label, 'manual', input.note ?? null);
    return this.wallets(tokenId);
  }

  removeWallet(tokenId: number, id: number): TeamWallet[] {
    if (!this.ctx.team.deleteWallet(tokenId, id)) throw new NotFoundError('Wallet introuvable ou ajouté automatiquement (non supprimable).');
    return this.wallets(tokenId);
  }

  labelAddress(address: string, label: string): void {
    if (!isSolanaAddress(address)) throw new ValidationError('Adresse Solana invalide.');
    this.ctx.team.upsertLabel(address.trim(), label.trim(), 'manual');
  }

  actions(tokenId: number, days = 30): OnchainAction[] {
    this.tokens.require(tokenId);
    return this.ctx.team.actions(tokenId, nowS() - days * 86400);
  }

  supplyEvents(tokenId: number, days = 90): SupplyEvent[] {
    this.tokens.require(tokenId);
    return this.ctx.team.supplyEvents(tokenId, nowS() - days * 86400);
  }

  get available(): boolean {
    return !!this.ctx.sources.helius?.enhancedAvailable;
  }

  /** Job 15 min : transactions des wallets équipe (Helius) + variations d'offre déduites de la série marché. */
  async runAll(): Promise<{ actions: number; supplyEvents: number }> {
    let actions = 0, supplyEvents = 0;
    for (const t of this.ctx.tokens.listActive()) {
      supplyEvents += this.deriveSupplyEvents(t.id);
      if (!this.available) continue;
      for (const w of this.wallets(t.id)) {
        try { actions += await this.collectWallet(t.id, t.address, w.address, t.symbol); }
        catch (err) { this.ctx.log.warn({ err: (err as Error).message, wallet: w.address }, 'Collecte on-chain échouée'); }
      }
    }
    return { actions, supplyEvents };
  }

  private async collectWallet(tokenId: number, mint: string, wallet: string, symbol: string | null): Promise<number> {
    const helius = this.ctx.sources.helius!;
    const list = await helius.getAddressActivities(wallet, mint, 100);
    const counterparties = new Set<string>();
    for (const a of list) for (const t of (a.raw as { tokenTransfers?: any[] })?.tokenTransfers ?? []) { if (t.toUserAccount) counterparties.add(t.toUserAccount); if (t.fromUserAccount) counterparties.add(t.fromUserAccount); }
    const labels = this.ctx.team.labels([...counterparties]);
    const rows = [];
    for (const a of list) {
      const c = classifyHeliusTx(a.raw, wallet, mint, (addr) => labels.get(addr) ?? null);
      if (!c) continue;
      rows.push({ token_id: tokenId, wallet_address: wallet, tx_signature: a.signature, ts: a.ts, kind: c.kind, amount: c.amount, amount_usd: null, counterparty: c.counterparty, counterparty_label: c.counterpartyLabel, source: 'helius', raw: JSON.stringify(a.raw).slice(0, 20_000) });
    }
    const inserted = this.ctx.team.insertActions(rows);
    if (inserted > 0) await this.alertOnNew(tokenId, mint, symbol, rows);
    return inserted;
  }

  private async alertOnNew(tokenId: number, mint: string, symbol: string | null, rows: { tx_signature: string; ts: number; kind: string; amount: number | null; counterparty_label: string | null; wallet_address: string }[]): Promise<void> {
    const cfg = this.cfg;
    const supply = this.ctx.snapshots.latestMarket(tokenId)?.supplyCirc ?? null;
    const price = this.ctx.snapshots.latestMarket(tokenId)?.priceUsd ?? null;
    const recent = rows.filter((r) => nowS() - r.ts < 7 * 86400);
    for (const r of recent) {
      const pct = supply && r.amount ? (r.amount / supply) * 100 : null;
      const usd = price && r.amount ? r.amount * price : null;
      const short = `${r.wallet_address.slice(0, 4)}…${r.wallet_address.slice(-4)}`;
      if (r.kind === 'transfer_out' && r.counterparty_label?.startsWith('exchange:') && ((pct ?? 0) >= cfg.teamTransferMinPctSupply || (usd ?? 0) >= cfg.teamTransferMinUsd)) {
        await this.alerts.fireEvent({ tokenId, type: 'team_transfer_to_exchange', priority: 'urgent', dedupeKey: `tx:${r.tx_signature}`, cooldownS: 0,
          ruleText: `Le wallet équipe ${short} a transféré ${fmt(r.amount)} ${symbol ?? ''} (${pct?.toFixed(2) ?? '?'} % de l’offre${usd ? `, ≈ ${fmt(usd)} $` : ''}) vers ${r.counterparty_label.replace('exchange:', '')}. Seuils : ${cfg.teamTransferMinPctSupply} % ou ${cfg.teamTransferMinUsd} $.`,
          payload: { signature: r.tx_signature } });
      } else if (r.kind === 'lp_remove') {
        await this.alerts.fireEvent({ tokenId, type: 'team_lp_remove', priority: 'urgent', dedupeKey: `tx:${r.tx_signature}`, cooldownS: 0,
          ruleText: `Le wallet équipe ${short} a retiré de la liquidité (${r.counterparty_label ?? 'pool inconnu'}). Transaction ${r.tx_signature.slice(0, 12)}…`, payload: { signature: r.tx_signature } });
      } else if (r.kind === 'swap_sell' && (pct ?? 0) >= cfg.teamSellMinPctSupply) {
        await this.alerts.fireEvent({ tokenId, type: 'team_sell', priority: 'high', dedupeKey: `tx:${r.tx_signature}`, cooldownS: 0,
          ruleText: `Le wallet équipe ${short} a vendu ${fmt(r.amount)} ${symbol ?? ''} (${pct?.toFixed(2)} % de l’offre, seuil ${cfg.teamSellMinPctSupply} %).`, payload: { signature: r.tx_signature } });
      }
    }
    void mint;
  }

  /** Variations d'offre entre snapshots marché consécutifs : la preuve des burns, indépendante de toute annonce. */
  deriveSupplyEvents(tokenId: number): number {
    const from = this.ctx.team.supplyWatermark(tokenId) ?? 0;
    const series = this.ctx.snapshots.marketSince(tokenId, from).filter((m) => m.supplyCirc !== null);
    let n = 0;
    for (let i = 1; i < series.length; i++) {
      const a = series[i - 1]!, b = series[i]!;
      const before = a.supplyCirc as number, after = b.supplyCirc as number;
      if (before <= 0) continue;
      const delta = after - before;
      const pct = (delta / before) * 100;
      if (Math.abs(pct) < 1e-7) continue;
      this.ctx.team.insertSupplyEvent({ token_id: tokenId, ts_from: a.ts, ts_to: b.ts, supply_before: before, supply_after: after, delta, delta_pct: pct, kind: delta < 0 ? 'burn' : 'mint' });
      n++;
    }
    return n;
  }
}

function fmt(v: number | null): string {
  return v === null ? '?' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v);
}
