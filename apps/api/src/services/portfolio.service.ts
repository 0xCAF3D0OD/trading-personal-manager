import type { PortfolioHistoryPoint, PortfolioSettings, PortfolioView } from '@tpm/shared';
import { FIAT, type KrakenBalance, type KrakenTicker } from '../datasources/kraken/kraken.source.js';
import { nowS } from '../db/client.js';
import { planVsAccount, valuePositions, type OnchainPrice } from '../portfolio/valuation.js';
import type { AlertService } from './alert.service.js';
import { AppContext } from './context.js';
import type { SettingsService } from './settings.service.js';
import type { TokenService } from './token.service.js';

const PORTFOLIO_TOKEN = 'PortfolioAlerts11111111111111111111111111111';
const dayOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

/**
 * Portefeuille Kraken en lecture seule (docs/06). Relevé en mémoire toutes les `refreshIntervalS`,
 * un seul conservé par jour en base. Le module ne sait rien faire d'autre que lire et valoriser.
 */
export class PortfolioService {
  private cache: { at: number; balances: KrakenBalance[]; tickers: KrakenTicker[] } | null = null;
  private lastError: string | null = null;

  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService, private readonly settings: SettingsService, private readonly alerts: AlertService) {}

  get configured(): boolean { return !!this.ctx.sources.kraken; }
  private cfg(): PortfolioSettings { return this.settings.get<PortfolioSettings>('portfolio'); }

  /** Soldes et prix Kraken, depuis le cache si assez récents. `force` ignore le cache (bouton Rafraîchir, limité). */
  async refresh(force = false): Promise<{ balances: KrakenBalance[]; tickers: KrakenTicker[]; at: number; cached: boolean }> {
    const kraken = this.ctx.sources.kraken;
    if (!kraken) throw new Error('Kraken non configuré');
    const cfg = this.cfg();
    const now = nowS();
    if (!force && this.cache && now - this.cache.at < cfg.refreshIntervalS) return { ...this.cache, cached: true };
    const balances = await kraken.balance();
    const wanted: { base: string; quote: string }[] = [{ base: 'EUR', quote: 'USD' }];
    for (const b of balances) {
      if (b.asset === 'EUR' || b.asset === 'USD') continue;
      if (FIAT.has(b.asset)) { wanted.push({ base: 'EUR', quote: b.asset }); continue; }
      wanted.push({ base: b.asset, quote: 'EUR' }, { base: b.asset, quote: 'USD' });
    }
    let tickers: KrakenTicker[] = [];
    try { tickers = await kraken.tickers(wanted); } catch (err) { this.ctx.log.warn({ err: (err as Error).message }, 'Kraken Ticker indisponible : valeurs inconnues'); }
    this.cache = { at: now, balances, tickers };
    this.lastError = null;
    return { ...this.cache, cached: false };
  }

  private onchainPrices(mappings: PortfolioSettings['mappings']): Map<number, OnchainPrice> {
    const out = new Map<number, OnchainPrice>();
    for (const m of mappings) {
      const t = this.ctx.tokens.byId(m.tokenId);
      if (!t) continue;
      const snap = this.ctx.snapshots.latestMarket(m.tokenId);
      out.set(m.tokenId, { tokenId: m.tokenId, symbol: t.symbol, priceUsd: snap?.priceUsd ?? null, source: snap?.priceSource ?? 'unavailable', fetchedAt: snap?.ts ?? null });
    }
    return out;
  }

  async view(force = false): Promise<PortfolioView> {
    const cfg = this.cfg();
    const base: PortfolioView = {
      configured: this.configured, enabled: cfg.enabled, missingVariable: this.configured ? null : 'KRAKEN_API_KEY et KRAKEN_API_SECRET (permission « Query Funds » seule)',
      baseCurrency: cfg.baseCurrency, fetchedAt: null, cached: false, total: null, totalEur: null, totalUsd: null, unknownCount: 0,
      previousDayTotal: null, previousDay: null, changeDayPct: null, positions: [], planVsAccount: [], error: null,
    };
    if (!this.configured || !cfg.enabled) return base;
    let data;
    try { data = await this.refresh(force); }
    catch (err) { this.lastError = (err as Error).message; return { ...base, error: this.lastError }; }
    const v = valuePositions({ balances: data.balances, tickers: data.tickers, base: cfg.baseCurrency, mappings: cfg.mappings, onchain: this.onchainPrices(cfg.mappings) });
    const total = cfg.baseCurrency === 'EUR' ? v.totalEur : v.totalUsd;
    const today = dayOf(data.at);
    const prevDay = this.ctx.portfolio.previousDay(today);
    const prevTotal = prevDay ? this.ctx.portfolio.totalOf(prevDay, cfg.baseCurrency) : null;
    const planVs = [];
    for (const p of v.positions) {
      if (p.tokenId === null) continue;
      const plan = this.ctx.plans.current(p.tokenId);
      if (plan) planVs.push(planVsAccount(p, plan, p.tokenSymbol ?? p.asset));
    }
    return {
      ...base, fetchedAt: data.at, cached: data.cached, total, totalEur: v.totalEur, totalUsd: v.totalUsd, unknownCount: v.unknownCount,
      previousDayTotal: prevTotal, previousDay: prevDay, changeDayPct: prevTotal && total !== null ? ((total - prevTotal) / prevTotal) * 100 : null,
      positions: v.positions, planVsAccount: planVs, error: null,
    };
  }

  history(days: number): PortfolioHistoryPoint[] {
    const cfg = this.cfg();
    return this.ctx.portfolio.history(dayOf(nowS() - days * 86400), cfg.baseCurrency);
  }

  /** Job quotidien : conserve le relevé du jour (le dernier remplace les précédents) et, si demandé, alerte sur la variation. */
  async daily(): Promise<string> {
    if (!this.configured) return 'Kraken non configuré';
    const cfg = this.cfg();
    if (!cfg.enabled) return 'module désactivé';
    const data = await this.refresh(true);
    const v = valuePositions({ balances: data.balances, tickers: data.tickers, base: cfg.baseCurrency, mappings: cfg.mappings, onchain: this.onchainPrices(cfg.mappings) });
    const day = dayOf(data.at);
    const prevDay = this.ctx.portfolio.previousDay(day);
    const prevTotal = prevDay ? this.ctx.portfolio.totalOf(prevDay, cfg.baseCurrency) : null;
    this.ctx.portfolio.replaceDay(day, v.positions.map((p) => ({
      ts: data.at, asset: p.asset, kraken_code: p.krakenCode, state: p.state, balance: p.balance, price_eur: p.priceEur, price_usd: p.priceUsd,
      price_source: p.priceSource, onchain_price_usd: p.onchainPriceUsd, value_eur: p.valueEur, value_usd: p.valueUsd, token_id: p.tokenId,
    })));
    const total = cfg.baseCurrency === 'EUR' ? v.totalEur : v.totalUsd;
    let alerted = '';
    if (cfg.dailyChangeAlertPct > 0 && prevTotal && total !== null) {
      const change = ((total - prevTotal) / prevTotal) * 100;
      if (Math.abs(change) >= cfg.dailyChangeAlertPct) {
        const cur = cfg.baseCurrency === 'EUR' ? '€' : '$';
        const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
        const res = await this.alerts.fireEvent({
          tokenId: this.technicalTokenId(), type: 'portfolio_daily_change', priority: 'default', dedupeKey: `portfolio:${day}`, cooldownS: 0,
          observed: change, threshold: cfg.dailyChangeAlertPct,
          ruleText: `Portefeuille Kraken : ${change >= 0 ? '+' : ''}${change.toFixed(1)} % depuis le ${prevDay} (${fmt(prevTotal)} ${cur} → ${fmt(total)} ${cur}). Valeur observée, aucune action.`,
        });
        alerted = res.fired ? ', alerte envoyée' : '';
      }
    }
    return `${v.positions.length} position(s) relevée(s) pour le ${day}${alerted}`;
  }

  /** Les alertes sont rattachées à un token ; le portefeuille utilise un token technique archivé, comme le scanner. */
  private technicalTokenId(): number {
    const holder = this.ctx.tokens.byAddress(PORTFOLIO_TOKEN);
    if (holder) return holder.id;
    const row = this.ctx.tokens.insert({ address: PORTFOLIO_TOKEN, symbol: 'PORTEFEUILLE', name: 'Alertes du portefeuille', decimals: 0, program: 'spl-token', createdAt: null, createdAtSource: null, creatorAddress: null, creatorSource: null });
    this.ctx.tokens.archive(row.id);
    return row.id;
  }
}
